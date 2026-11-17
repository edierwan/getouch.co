// Shared by the Databases server page (probes) and client (rendering). SERAPOD-INFRA-007
const SUPABASE_SSO_STUDIO = 'https://sb-sso.getouch.co';
const SUPABASE_PREPROD_STUDIO = 'https://sb-stg-serapod.getouch.co';

export interface SupabaseStack {
  id: string;
  name: string;
  environment: string;
  studioUrl: string;
  apiUrl?: string;
  description: string;
}

export const SUPABASE_STACKS: SupabaseStack[] = [
  {
    id: 'sso',
    name: 'Getouch SSO',
    environment: 'Production',
    studioUrl: SUPABASE_SSO_STUDIO,
    apiUrl: 'https://sb-sso.getouch.co',
    description: 'Central shared sign-in and identity provider for Getouch services.',
  },
  {
    id: 'preprod',
    name: 'Serapod Preprod',
    environment: 'Preprod',
    studioUrl: SUPABASE_PREPROD_STUDIO,
    apiUrl: 'https://sb-stg-serapod.getouch.co',
    description: 'Isolated Supabase stack for Serapod product preprod.',
  },
];

export const SUPABASE_GATEWAY_TARGETS = SUPABASE_STACKS.filter((stack) => stack.apiUrl).map((stack) => ({ id: stack.id, apiUrl: stack.apiUrl as string }));
