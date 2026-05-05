type LiteLlmProbeStatus = 'ready' | 'route_missing' | 'manual_action_required' | 'degraded' | 'not_configured';

type JsonRecord = Record<string, unknown>;

export type PlatformAiConfig = {
  liteLlmBaseUrl: string;
  liteLlmApiKey: string | null;
  modelAlias: string;
  timeoutMs: number;
};

export type LiteLlmProbeResult = {
  checkedAt: string;
  baseUrl: string;
  healthUrl: string;
  modelsUrl: string;
  chatUrl: string;
  healthOk: boolean;
  modelsOk: boolean;
  aliasFound: boolean;
  chatOk: boolean;
  chatStatusCode: number | null;
  status: LiteLlmProbeStatus;
  models: string[];
  message: string;
  chatMessage: string;
};

export type PlatformAiForwardInput = {
  appCode: string;
  body: unknown;
};

export const DEFAULT_PLATFORM_LITELLM_BASE_URL = 'https://litellm.getouch.co/v1';
export const DEFAULT_PLATFORM_LITELLM_INTERNAL_BASE_URL = 'http://litellm:4000/v1';
export const DEFAULT_PLATFORM_LITELLM_MODEL_ALIAS = 'getouch-qwen3-14b';

function pickEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

function buildLiteLlmHealthUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/v1$/, '')}/health/liveliness`;
}

export function getPlatformAiConfig(): PlatformAiConfig {
  return {
    liteLlmBaseUrl: normalizeBaseUrl(
      pickEnv('PLATFORM_LITELLM_BASE_URL', 'GETOUCH_LITELLM_BASE_URL') || DEFAULT_PLATFORM_LITELLM_BASE_URL,
    ),
    liteLlmApiKey: pickEnv('PLATFORM_LITELLM_API_KEY', 'GETOUCH_LITELLM_API_KEY'),
    modelAlias: pickEnv('PLATFORM_LITELLM_MODEL_ALIAS', 'GETOUCH_LITELLM_MODEL_ALIAS') || DEFAULT_PLATFORM_LITELLM_MODEL_ALIAS,
    timeoutMs: Number(pickEnv('PLATFORM_LITELLM_TIMEOUT_MS', 'GETOUCH_LITELLM_TIMEOUT_MS') || '12000'),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const signal = AbortSignal.timeout(Math.max(1_000, timeoutMs));
  return fetch(url, {
    ...init,
    cache: 'no-store',
    signal,
  });
}

function sanitizeLiteLlmErrorMessage(input: string) {
  const compact = input.replace(/\s+/g, ' ').trim();
  if (!compact) return 'LiteLLM request failed.';
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
}

function summarizeLiteLlmProbeFailure(status: number, body: string, context: string) {
  const compact = sanitizeLiteLlmErrorMessage(body);
  if (status === 403 && /1010/.test(compact)) {
    return `${context} is blocked by the current edge policy (403 / 1010).`;
  }
  if (status === 401 || status === 403) {
    return `${context} rejected the configured LiteLLM key.`;
  }
  return compact === 'LiteLLM request failed.'
    ? `${context} returned ${status}.`
    : `${context} returned ${status}: ${compact}`;
}

function parseLiteLlmModelsPayload(input: string) {
  const payload = JSON.parse(input) as { data?: Array<{ id?: string }> };
  return Array.isArray(payload?.data)
    ? payload.data.map((entry) => entry.id).filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
}

function hasChatChoices(input: string) {
  const payload = JSON.parse(input) as { choices?: unknown[] };
  return Array.isArray(payload?.choices) && payload.choices.length > 0;
}

function normalizeChatBody(input: unknown, modelAlias: string, appCode: string) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false as const, message: 'Chat body must be a JSON object.' };
  }

  const payload = { ...(input as JsonRecord) };
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return { ok: false as const, message: 'Chat body must include a non-empty messages array.' };
  }

  if (payload.stream === true) {
    return { ok: false as const, message: 'Streaming is not supported on the platform broker AI route yet.' };
  }

  const existingMetadata = payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
    ? payload.metadata as JsonRecord
    : {};

  return {
    ok: true as const,
    payload: {
      ...payload,
      model: modelAlias,
      stream: false,
      metadata: {
        ...existingMetadata,
        platform_app_code: appCode,
        routed_via: 'platform_broker',
      },
    },
  };
}

export async function forwardPlatformAiChat(input: PlatformAiForwardInput): Promise<Response> {
  const config = getPlatformAiConfig();
  if (!config.liteLlmApiKey) {
    return Response.json(
      {
        error: 'platform_ai_not_configured',
        message: 'Platform AI router is not configured on the portal server.',
      },
      { status: 424 },
    );
  }

  const normalized = normalizeChatBody(input.body, config.modelAlias, input.appCode);
  if (!normalized.ok) {
    return Response.json({ error: 'invalid_request', message: normalized.message }, { status: 400 });
  }

  try {
    const response = await fetchWithTimeout(
      `${config.liteLlmBaseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.liteLlmApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalized.payload),
      },
      config.timeoutMs,
    );

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: 'platform_ai_upstream_failed',
        message: sanitizeLiteLlmErrorMessage(error instanceof Error ? error.message : 'LiteLLM request failed.'),
      },
      { status: 424 },
    );
  }
}

export async function probeLiteLlmRoute(config: PlatformAiConfig = getPlatformAiConfig()): Promise<LiteLlmProbeResult> {
  const checkedAt = new Date().toISOString();
  const baseUrl = normalizeBaseUrl(config.liteLlmBaseUrl || DEFAULT_PLATFORM_LITELLM_BASE_URL);
  const healthUrl = buildLiteLlmHealthUrl(baseUrl);
  const modelsUrl = `${baseUrl}/models`;
  const chatUrl = `${baseUrl}/chat/completions`;

  if (!baseUrl) {
    return {
      checkedAt,
      baseUrl: DEFAULT_PLATFORM_LITELLM_BASE_URL,
      healthUrl: buildLiteLlmHealthUrl(DEFAULT_PLATFORM_LITELLM_BASE_URL),
      modelsUrl: `${DEFAULT_PLATFORM_LITELLM_BASE_URL}/models`,
      chatUrl: `${DEFAULT_PLATFORM_LITELLM_BASE_URL}/chat/completions`,
      healthOk: false,
      modelsOk: false,
      aliasFound: false,
      chatOk: false,
      chatStatusCode: null,
      status: 'not_configured',
      models: [],
      message: 'LiteLLM base URL is not configured.',
      chatMessage: 'LiteLLM chat completion probe did not run.',
    };
  }

  let healthOk = false;
  let healthMessage = 'LiteLLM health probe did not run.';

  try {
    const response = await fetchWithTimeout(healthUrl, {}, config.timeoutMs);
    healthOk = response.ok;
    healthMessage = response.ok
      ? 'LiteLLM health probe succeeded.'
      : `LiteLLM health probe returned ${response.status}.`;
  } catch (error) {
    healthMessage = error instanceof Error ? error.message : 'LiteLLM health probe failed.';
  }

  if (!config.liteLlmApiKey) {
    return {
      checkedAt,
      baseUrl,
      healthUrl,
      modelsUrl,
      chatUrl,
      healthOk,
      modelsOk: false,
      aliasFound: false,
      chatOk: false,
      chatStatusCode: null,
      status: healthOk ? 'manual_action_required' : 'degraded',
      models: [],
      message: healthOk
        ? 'LiteLLM is reachable, but /v1/models requires a server-side LiteLLM key to verify the active alias.'
        : healthMessage,
      chatMessage: 'LiteLLM chat completion probe requires a server-side LiteLLM key.',
    };
  }

  try {
    const response = await fetchWithTimeout(modelsUrl, {
      headers: {
        Authorization: `Bearer ${config.liteLlmApiKey}`,
      },
    }, config.timeoutMs);

    const modelsBody = await response.text();
    const models = (() => {
      try {
        return parseLiteLlmModelsPayload(modelsBody);
      } catch {
        return [];
      }
    })();
    const aliasFound = models.includes(config.modelAlias);

    if (!response.ok) {
      return {
        checkedAt,
        baseUrl,
        healthUrl,
        modelsUrl,
        chatUrl,
        healthOk,
        modelsOk: false,
        aliasFound: false,
        chatOk: false,
        chatStatusCode: null,
        status: healthOk ? 'degraded' : 'degraded',
        models,
        message: summarizeLiteLlmProbeFailure(response.status, modelsBody, 'LiteLLM /v1/models'),
        chatMessage: 'LiteLLM chat completion probe was skipped because /v1/models did not succeed.',
      };
    }

    if (!aliasFound) {
      return {
        checkedAt,
        baseUrl,
        healthUrl,
        modelsUrl,
        chatUrl,
        healthOk,
        modelsOk: true,
        aliasFound,
        chatOk: false,
        chatStatusCode: null,
        status: 'route_missing',
        models,
        message: `LiteLLM is reachable, but ${config.modelAlias} is not present in /v1/models.`,
        chatMessage: `LiteLLM chat completion probe was skipped because ${config.modelAlias} is missing from /v1/models.`,
      };
    }

    try {
      const chatResponse = await fetchWithTimeout(
        chatUrl,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.liteLlmApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.modelAlias,
            messages: [{ role: 'user', content: 'hi' }],
            stream: false,
            max_tokens: 16,
            temperature: 0,
          }),
        },
        config.timeoutMs,
      );

      const chatBody = await chatResponse.text();
      const chatOk = chatResponse.ok && (() => {
        try {
          return hasChatChoices(chatBody);
        } catch {
          return false;
        }
      })();

      return {
        checkedAt,
        baseUrl,
        healthUrl,
        modelsUrl,
        chatUrl,
        healthOk,
        modelsOk: true,
        aliasFound,
        chatOk,
        chatStatusCode: chatResponse.status,
        status: 'ready',
        models,
        message: `LiteLLM exposes ${config.modelAlias}.`,
        chatMessage: chatOk
          ? `LiteLLM chat completion succeeded for ${config.modelAlias}.`
          : chatResponse.ok
            ? 'LiteLLM chat completion returned malformed JSON.'
            : summarizeLiteLlmProbeFailure(chatResponse.status, chatBody, 'LiteLLM /chat/completions'),
      };
    } catch (error) {
      return {
        checkedAt,
        baseUrl,
        healthUrl,
        modelsUrl,
        chatUrl,
        healthOk,
        modelsOk: true,
        aliasFound,
        chatOk: false,
        chatStatusCode: null,
        status: 'ready',
        models,
        message: `LiteLLM exposes ${config.modelAlias}.`,
        chatMessage: error instanceof Error ? sanitizeLiteLlmErrorMessage(error.message) : 'LiteLLM chat completion probe failed.',
      };
    }
  } catch (error) {
    return {
      checkedAt,
      baseUrl,
      healthUrl,
      modelsUrl,
      chatUrl,
      healthOk,
      modelsOk: false,
      aliasFound: false,
      chatOk: false,
      chatStatusCode: null,
      status: 'degraded',
      models: [],
      message: error instanceof Error ? error.message : 'LiteLLM models probe failed.',
      chatMessage: 'LiteLLM chat completion probe was skipped because /v1/models failed.',
    };
  }
}