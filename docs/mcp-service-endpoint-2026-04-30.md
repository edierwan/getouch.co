# MCP Service Endpoint Rebuild

## Public surface

- Public page: `https://mcp.getouch.co`
- MCP endpoint: `https://mcp.getouch.co/mcp`
- Health probe: `https://mcp.getouch.co/healthz`
- Portal console: `https://portal.getouch.co/service-endpoints/mcp`

## Runtime shape

- Runtime now lives in the main web app under `/api/mcp` instead of the old `mcp-gateway` filesystem bridge.
- Public root is served by the web app through host-based routing in `proxy.ts`.
- The endpoint uses central bearer API keys with service `mcp` and scopes like `mcp:connect`, `mcp:tools:list`, and `mcp:tools:call`.

## Database

- Existing Postgres database name: `mcp`
- Bootstrap file: `scripts/mcp-bootstrap.sql`
- Tables created by bootstrap:
  - `mcp_servers`
  - `mcp_tools`
  - `mcp_clients`
  - `mcp_access_keys`
  - `mcp_activity_logs`
  - `mcp_tool_calls`
  - `mcp_tenant_mappings`
  - `mcp_settings`

## Safe initial tool set

- `get_status`
- `list_available_services`
- `get_service_endpoint_info`
- `get_tenant_context`

## Disabled scaffolds

- `filesystem`
- `postgres`
- `git`
- `browser`

These remain registered as scaffolds only and are not exposed as active tools.

## Deploy notes

1. Back up the legacy MCP workspace path before removing the old container.
2. Apply `scripts/mcp-bootstrap.sql` to the `mcp` database.
3. Redeploy Coolify application id 2 and reload Caddy only if the route config changed.
4. Remove the old orphaned `mcp-gateway` container with `docker compose up -d --remove-orphans`.

## Rollback

- Restore the previous Caddy block and old `mcp-gateway` compose service from git history.
- Re-run `docker compose up -d mcp-gateway caddy` if a rollback is needed.