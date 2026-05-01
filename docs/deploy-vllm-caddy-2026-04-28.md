# Manual Deploy Step — vllm.getouch.co Caddy vhost

Date: 2026-04-28
Related commit: `988523e` on `main`
Related app: Coolify uuid `mqmo5bwkxysedbg7vvh6tk1f` (auto-deploys on push)

## Why this is a manual step

The application change (commit `988523e`) is fully pushed and will be picked up by Coolify auto-deploy. However, the public domain `vllm.getouch.co` is not yet routed by Caddy on the VPS. Adding the vhost requires SSH to the VPS, which goes through Tailscale.

At the time of the change, Tailscale was **stopped** on the developer Mac, so the change to `infra/Caddyfile` was not applied automatically.

## Prerequisites on the developer machine

```bash
sudo tailscale up
tailscale status | head
ping -c 2 100.84.14.93
```

## SSH and edit the Caddyfile

```bash
ssh deploy@100.84.14.93
# password: <see secrets vault — not committed>

cd /home/deploy/apps/getouch.co/infra
cp Caddyfile Caddyfile.bak.$(date +%Y%m%d-%H%M%S)
```

Add this block (after the existing `portal.getouch.co` block, before `respond` defaults if any):

```caddy
http://vllm.getouch.co {
    import common_headers

    handle /health {
        reverse_proxy getouch-coolify-app:3000
    }
    handle /ready {
        reverse_proxy getouch-coolify-app:3000
    }
    handle /v1/* {
        reverse_proxy getouch-coolify-app:3000
    }

    respond 404
}
```

Notes:

- `getouch-coolify-app` is the stable Coolify upstream name for app uuid `mqmo5bwkxysedbg7vvh6tk1f`.
- TLS is terminated by Cloudflare; Caddy listens on plain HTTP and uses the existing edge proxy chain — same pattern as `portal.getouch.co`.
- `import common_headers` reuses the project's HSTS/CSP/Permissions-Policy snippet.

## Reload Caddy

The Caddy admin endpoint is disabled, so use a container restart:

```bash
docker restart caddy
```

## Set Coolify env vars

In Coolify UI for app uuid `mqmo5bwkxysedbg7vvh6tk1f`, add at minimum:

```
GETOUCH_VLLM_GATEWAY_ENABLED=true
GETOUCH_VLLM_PUBLIC_BASE_URL=https://vllm.getouch.co/v1
GETOUCH_VLLM_GATEWAY_ALLOWED_HOSTS=vllm.getouch.co,localhost,127.0.0.1
GETOUCH_VLLM_GATEWAY_KEYS=<one-or-more-real-keys>
GETOUCH_VLLM_BACKEND_TYPE=disabled        # keep disabled until vLLM container is up
GETOUCH_VLLM_BACKEND_BASE_URL=http://vllm-qwen3-14b-fp8:8000/v1
```

Optionally set `GETOUCH_VLLM_GATEWAY_ADMIN_TEST_KEY` for the portal "Test Authenticated Models" button. Real values must come from the secrets vault — do **not** commit them.

Then redeploy the app.

## Validation

```bash
curl -i https://vllm.getouch.co/health
# expect: 200, JSON {"ok":true,...}

curl -i https://vllm.getouch.co/ready
# expect: 200 if backend ready, otherwise 503 with structured JSON

curl -i https://vllm.getouch.co/v1/models
# expect: 401 (no Authorization header)

curl -i https://vllm.getouch.co/v1/models \
  -H "Authorization: Bearer <GETOUCH_VLLM_API_KEY>"
# expect: 200, list contains getouch-qwen3-14b and getouch-embed
# expect: list does NOT contain getouch-qwen3-30b (status=blocked is hidden)
```

## Constraints honored

- `llm.getouch.co` is **not** added to Caddy. It remains reserved for future LiteLLM.
- Raw vLLM (`vllm-qwen3-14b-fp8:8000`) is not exposed through Caddy.
- The existing `portal.getouch.co` route uses `getouch-coolify-app:3000`.
- No Ollama or Open WebUI configuration is touched by this step.
