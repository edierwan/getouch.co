// Shared by the Databases server page (probes) and client (rendering).
// GETOUCH-UAT-001: Studio is no longer the Kong URL. `studioUrl` is the *planned* Cloudflare-Access-protected hostname;
// the portal only enables "Open Studio" after a live probe proves Access protects it (see lib/supabase-health-classify.ts).

export interface SupabaseStack {
  id: string;
  name: string;
  environment: string;
  /** Kong API gateway (an API, not a UI). */
  apiUrl: string;
  /** Planned protected Studio URL, or null if none is planned. Never the Kong URL. */
  studioUrl: string | null;
  /** Docker container name prefix on the GetTouch host. */
  containerPrefix: string;
  description: string;
}

export const SUPABASE_STACKS: SupabaseStack[] = [
  {
    id: 'sso',
    name: 'GetTouch SSO',
    environment: 'Production SSO',
    apiUrl: 'https://sb-sso.getouch.co',
    studioUrl: 'https://studio-sso.getouch.co',
    containerPrefix: 'getouch-sso',
    description: 'Central authentication and identity service for GetTouch applications.',
  },
  {
    id: 'preprod',
    name: 'Serapod Preprod',
    environment: 'Pre-production',
    apiUrl: 'https://sb-stg-serapod.getouch.co',
    studioUrl: 'https://studio-preprod.getouch.co',
    containerPrefix: 'serapod-preprod',
    description: 'Isolated GetTouch-hosted Serapod pre-production stack (not the Serapod2U KVM2 staging environment).',
  },
];

export const SUPABASE_HEALTH_TARGETS = SUPABASE_STACKS.map((stack) => ({
  id: stack.id,
  apiUrl: stack.apiUrl,
  containerPrefix: stack.containerPrefix,
  studioUrl: stack.studioUrl,
}));
