# FusionPBX / FreeSWITCH Voice Setup

Date: 2026-04-29

## Deployment model

Getouch Voice is deployed as a reversible two-container stack inside the existing Docker + Caddy topology.

- `voice-fusionpbx`: native FusionPBX web UI container
- `voice-freeswitch`: FreeSWITCH RTP/SIP engine container
- Database: existing PostgreSQL database `voice`
- Reverse proxy: existing Caddy container

This avoids a host-native FusionPBX install, keeps the change reversible, and stays compatible with the current `deploy` user privileges.

## Public routes

- `pbx.getouch.co`: native FusionPBX admin UI
- `voice.getouch.co`: future Getouch Voice API placeholder endpoint
- `portal.getouch.co/communications/voice`: Getouch control and status UI

Both `pbx.getouch.co` and `voice.getouch.co` are protected by the existing Caddy `admin_auth` gate.

## Docker services

- `voice-fusionpbx`
- `voice-freeswitch`

Compose file: `compose.yaml`

Reverse proxy file: `infra/Caddyfile`

Container images are built from:

- `services/voice-fusionpbx`
- `services/voice-freeswitch`

## Database

- Database name: `voice`
- Database host in Compose: `postgres`
- Database user: existing app database user from `APP_DB_USER`
- Database password source: existing app database password from `APP_DB_PASSWORD`

No additional PostgreSQL database is created by this deployment.

## Persistent paths

All voice runtime state is kept under `/data/getouch/voice` on the VPS.

- `/data/getouch/voice/fusionpbx/config`: shared `/etc/fusionpbx`
- `/data/getouch/voice/fusionpbx/cache`: FusionPBX cache
- `/data/getouch/voice/freeswitch/conf`: shared `/etc/freeswitch`
- `/data/getouch/voice/freeswitch/data`: `/var/lib/freeswitch`
- `/data/getouch/voice/freeswitch/scripts`: `/usr/share/freeswitch/scripts`
- `/data/getouch/voice/freeswitch/sounds`: `/usr/share/freeswitch/sounds`

Back up these bind mounts together with the PostgreSQL `voice` database.

## Ports

Published from `voice-freeswitch`:

- `5060/udp`: internal SIP profile
- `5080/udp`: external SIP profile
- `16384-16415/udp`: RTP media range

Internal-only ports:

- `8021/tcp`: FreeSWITCH event socket, not exposed publicly
- `8080/tcp`: FusionPBX web container, only used behind Caddy

## Environment and secret names

Configured in the VPS `.env` file:

- `VOICE_DB_NAME`
- `FUSIONPBX_DOMAIN`
- `FUSIONPBX_ADMIN_USERNAME`
- `FUSIONPBX_ADMIN_PASSWORD`
- `FUSIONPBX_EVENT_SOCKET_PASSWORD`
- `FUSIONPBX_XML_CDR_USERNAME`
- `FUSIONPBX_XML_CDR_PASSWORD`
- `FUSIONPBX_RTP_START_PORT`
- `FUSIONPBX_RTP_END_PORT`
- `FUSIONPBX_EXTERNAL_SIP_IP`
- `FUSIONPBX_EXTERNAL_RTP_IP`
- `VOICE_SOUND_RATES`
- `VOICE_SOUND_TYPES`

The current deployment reuses existing database credentials from:

- `APP_DB_USER`
- `APP_DB_PASSWORD`

## Admin access

Admin access is two-stage.

1. Caddy `admin_auth` basic auth on `pbx.getouch.co`
2. Native FusionPBX login on `pbx.getouch.co/login.php`

The bootstrap FusionPBX admin username is `FUSIONPBX_ADMIN_USERNAME`.

## Current bootstrap state

- Default FusionPBX domain: `pbx.getouch.co`
- No independent portal tenant IDs are created inside FusionPBX
- No Baileys, Evolution, vLLM, or Dify changes are required for voice runtime
- `voice.getouch.co` currently serves as a protected placeholder surface, not the final API implementation

## Tenant mapping plan

Portal remains the source of truth for tenant identity.

Future control-plane mapping should be:

- Portal `tenant_id` -> FusionPBX `domain_uuid`
- Portal tenant metadata -> FusionPBX domain, extension ranges, trunks, gateways, ACL policy

Important constraint:

- do not create random tenant identifiers directly inside FusionPBX and treat them as authoritative

Recommended next schema step after Portal control-plane work is ready:

- add a portal-owned mapping table that records `tenant_id`, `fusionpbx_domain_uuid`, `domain_name`, lifecycle state, and sync timestamps

## SIP / RTP notes

- The initial RTP range is intentionally narrowed to `16384-16415/udp`
- `FUSIONPBX_EXTERNAL_SIP_IP` and `FUSIONPBX_EXTERNAL_RTP_IP` are available for later NAT tuning
- Event socket access between the web UI and FreeSWITCH uses the internal Docker network only
- SIP and RTP are not proxied through Caddy

Before production trunking or handset onboarding, confirm:

- provider-facing firewall rules for UDP `5060`, `5080`, and RTP `16384-16415`
- final external SIP and RTP IP values
- codec and NAT behavior for the chosen upstream carrier

## Rollback

Rollback is intentionally simple.

1. Remove or comment the `pbx.getouch.co` and `voice.getouch.co` blocks in `infra/Caddyfile`
2. Remove the `voice-fusionpbx` and `voice-freeswitch` services from `compose.yaml`
3. Restart the `caddy` container
4. Stop and remove the voice containers
5. Keep `/data/getouch/voice` and the `voice` database intact until the rollback is confirmed

Minimal container rollback commands:

```bash
docker compose stop voice-fusionpbx voice-freeswitch
docker compose rm -f voice-fusionpbx voice-freeswitch
docker restart caddy
```

## Operational notes

- FusionPBX initialization writes `config.conf` and FreeSWITCH config into shared bind mounts
- FreeSWITCH startup seeds default sound packs into the shared sounds path on first boot
- FusionPBX service helper scripts are host-oriented; inside containers they may log systemd-related noise even when the web UI is healthy

## Next steps

1. Replace the `voice.getouch.co` placeholder with the actual Getouch Voice API service
2. Add portal-owned tenant mapping between `tenant_id` and FusionPBX `domain_uuid`
3. Decide whether to keep the default `pbx.getouch.co` domain or create one domain per tenant as control-plane sync comes online
4. Add carrier trunk provisioning and NAT tuning for real SIP traffic
5. Add a narrow runtime health command for FreeSWITCH that does not depend on host-native service tooling