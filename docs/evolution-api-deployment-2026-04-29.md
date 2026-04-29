# Evolution API deployment - 2026-04-29

## Summary

Evolution API for Getouch is deployed as a Docker service on the VPS. It is not a separate GitHub repository. The portal at `portal.getouch.co/whatsapp-services/evolution` is the admin/control plane, while the backend service is reachable internally at `http://evolution-api:8080` and publicly at `https://evo.getouch.co`.

## Runtime layout

- Service/container name: `evolution-api`
- Redis sidecar: `evolution-redis`
- Docker image: `evoapicloud/evolution-api:v2.3.7`
- Docker networks: `getouch-edge`, `coolify`
- Reverse proxy route: `evo.getouch.co -> evolution-api:8080`
- Portal environment variables: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_BASE_URL`
- Backend auth variable: `AUTHENTICATION_API_KEY`

## Database

Evolution runtime data is configured against PostgreSQL database `evolution` via `DATABASE_CONNECTION_URI` in the VPS deployment overlay.

- Lowercase `evolution` is the live runtime database.
- Uppercase `Evolution` was an unused empty setup database and has been removed.
- Portal access stays on `EVOLUTION_API_URL` and `EVOLUTION_API_KEY`; the Evolution DB configuration remains owned by the `evolution-api` container.

## Safety boundaries

- Do not create a new GitHub repository for Evolution API.
- Do not reuse or delete the existing Baileys session at `wa.getouch.co`.
- Do not point the portal at the public URL; keep `EVOLUTION_API_URL` on the internal Docker hostname.
- Do not expose admin access without the Evolution `apikey` header.

## Notes

- The portal Evolution UI manages metadata, probing, sessions, logs, and related admin actions.
- The public Evolution endpoint enforces the `apikey` header on protected instance routes.
- Upgrading from the older `atendai/evolution-api:v2.2.3` image to `evoapicloud/evolution-api:v2.3.7` restored QR emission for fresh instances.
- `wa.getouch.co` remains the existing Baileys gateway and existing production number holder.
- Evolution API remains a WhatsApp service endpoint only; LINE and Telegram need separate providers later.
