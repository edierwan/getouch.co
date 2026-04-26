# Getouch.co Security Review And Origin Hardening

**Date:** 2026-04-14
**Scope:** Defensive review of Cloudflare bypass risk, origin exposure, reverse proxy posture, application surface, and practical hardening actions for the current Getouch stack.
**Mode:** Read-only assessment plus low-risk repo hardening changes.

---

## A. Executive Summary

- **Cloudflare bypass status:** not observed for the main `getouch.co` web app based on current evidence.
- **Main risk level:** high overall, but driven more by management surface exposure and secret hygiene than by confirmed direct origin bypass of the primary app.
- **Fix first today:**
  1. rotate any documented or seeded credentials
  2. remove public binds for management and database ports where possible
  3. place sensitive dashboards and admin surfaces behind Cloudflare Access or VPN/IP allowlists

### Short conclusion

The primary application path appears to be Cloudflare-fronted correctly today. The origin host is **not** exposing the main app on public `80/443` in the typical direct-origin way. However, several **non-web management and data-plane ports** are still published on all interfaces and are being protected mainly by host firewall policy. That is materially better than open exposure, but it is still weaker than removing the binds entirely.

The other major issue is that several **admin and operational hostnames remain publicly reachable via Cloudflare**, which means they are still internet-facing login targets unless Cloudflare Access or upstream auth is enforced.

---

## B. Findings Table

| Finding | Severity | Why it matters | Evidence to verify | Recommended fix |
|---|---|---|---|---|
| Hardcoded or shared privileged credentials exist in repo and docs | Critical | If any are still active, compromise risk is immediate. Even if rotated already, this increases accidental reuse and disclosure risk. | `scripts/seed.ts`, `README.md`, historical repo memory | Rotate immediately, remove from docs and scripts, move to env-driven bootstrap only |
| Main web origin does not currently appear directly exposed on public `80/443` | Info | This lowers the chance of a classic Cloudflare-to-origin bypass on the primary app | DNS resolves to Cloudflare only, host listens on `127.0.0.1:80`, no local `443` listener | Preserve this design and avoid reintroducing public origin listeners |
| Sensitive ports are published on all interfaces and rely on firewall drop rules | High | If firewall rules fail, those ports can become directly reachable from the internet | Host listeners showed `3030`, `6001`, `6002`, `8000`, `6543-6546` on `0.0.0.0`/`[::]`; `DOCKER-USER` drops them | Remove public binds entirely or bind to `127.0.0.1` or `tailscale0` only |
| Public management surfaces are internet-reachable through Cloudflare | High | These remain public login targets and increase attack surface | `db.getouch.co`, `grafana.getouch.co`, `st-sso.getouch.co`, `wa.getouch.co`, `chatwoot.getouch.co`, `analytics.getouch.co`, `ai.getouch.co`, `s3.getouch.co` return public responses | Protect with Cloudflare Access, IP allowlist, or VPN-only exposure |
| Reverse proxy accepts unknown or missing Host values too loosely | Medium | Weak host validation is poor origin hygiene and increases ambiguity in logging and request handling | Local origin returned `200` for invalid or missing Host values | Add explicit catch-all default vhost returning `421` or `404` |
| Trusted proxy and real client IP handling are not explicitly defined | Medium | Logging, rate limiting, and incident review may rely on proxy IPs or untrusted forwarded headers | No explicit Cloudflare trusted proxy config in `infra/Caddyfile` | Configure Cloudflare trusted proxies and real client IP handling |
| Security headers are incomplete and app fingerprinting is visible | Medium | Missing HSTS/CSP weakens browser-side hardening; `X-Powered-By` leaks stack detail | Public responses showed no HSTS, no CSP, and `X-Powered-By: Next.js` | Add HSTS, CSP baseline, Permissions-Policy, stricter Referrer-Policy, disable powered-by |
| No clear brute-force or route-level throttling on auth/admin/API paths | High | Login and admin surfaces can be abused even if Cloudflare is present | No meaningful route throttling found in app or proxy | Add Cloudflare rate limiting and origin-side throttling where feasible |
| WhatsApp console has a public UI and verbose health output | High | Exposes operational metadata and a public operator surface that should not be broadly visible | `services/wa/server.mjs` | Put behind Access/internal routing and reduce health output |
| Admin health-check route allows limited internal probing for any authenticated session | Medium | Logged-in non-admin users can trigger HEAD requests to internal-local targets and subdomains | `app/api/admin/health/route.ts` | Restrict to admin role and explicit allowlist only |
| Sessions are decent but admin hardening is still weak | Medium | Admin sessions last 7 days, are domain-wide, and there is no MFA step-up in app | `lib/auth.ts` | Shorten admin TTL, add MFA, consider narrower cookie scope |

---

## C. Immediate Fixes (Today)

- Rotate all credentials that appear in code, docs, repo memory, bootstrap scripts, or shared notes.
- Remove or rebind public Docker port mappings for `8000`, `6001`, `6002`, `3030`, and `6543-6546`.
- Put these hostnames behind Cloudflare Access immediately:
  - `coolify.getouch.co`
  - `db.getouch.co`
  - `grafana.getouch.co`
  - `st-sso.getouch.co`
  - any Supabase Studio hostname
  - `wa.getouch.co`
  - `chatwoot.getouch.co`
  - any non-customer-facing dashboard
- Add default-deny host handling at the reverse proxy.
- Add Cloudflare rate limiting for login, register, verify, webhook, admin, and API routes.
- Reduce or hide public WA operational UI and health metadata.
- Restrict internal admin health tooling to admins only.

---

## D. Hardening Plan (Next 7 Days)

1. Remove secrets from repository, README files, migration notes, seed scripts, and repo memory.
2. Move sensitive published ports off public interfaces and rely on proxy/tunnel/VPN ingress only.
3. Put all management hostnames behind Cloudflare Access with MFA.
4. Configure stronger edge headers and default host rejection in the reverse proxy.
5. Configure Cloudflare trusted proxies for correct client IP handling.
6. Add rate limiting at Cloudflare for auth, admin, API, and webhook paths.
7. Reduce public operational surfaces such as WA console pages and verbose health endpoints.
8. Add admin MFA and shorten privileged session lifetime.
9. Add alerting for unexpected access to origin ports, failed logins, and suspicious 4xx/5xx spikes.

---

## E. Config-Level Recommendations

### Nginx / Reverse Proxy

- Add a catch-all site that returns `421` for unknown hosts.
- Add HSTS and a practical CSP baseline.
- Remove `X-Powered-By` and other unnecessary fingerprinting.
- Add request size limits and sensible upstream timeout limits.
- Configure Cloudflare trusted proxies so logs and rate limits use real client IPs.

### Firewall

- Keep default deny inbound.
- If Cloudflare Tunnel is the only ingress path, remove public `80/443` host allows entirely.
- Keep `DOCKER-USER` drop rules, but do not depend on them as the only control.
- Prefer no host publishes for databases, realtime, Coolify, or internal management services.

### Cloudflare

- Ensure all customer-facing DNS entries are proxied.
- Set SSL/TLS to **Full (Strict)**.
- Enable **Always Use HTTPS**.
- Enable **Managed WAF Rules**.
- Enable **Rate Limiting Rules** for:
  - `/auth/login`
  - `/auth/register`
  - `/auth/verify`
  - `/api/*`
  - `/webhooks/*`
  - WA admin paths
- Put all sensitive panels behind **Cloudflare Access**.

### App Config

- Restrict internal tooling routes to admin users only.
- Add per-route throttling for login, registration, OTP, and privileged operations.
- Shorten admin session lifetime and consider separate admin cookie scope if feasible.
- Add MFA for admin accounts.

### SSH / Admin Access

- Keep SSH on Tailscale-only access.
- Keep key-only auth and confirm password auth is disabled.
- Rotate any previously shared SSH password immediately.

---

## F. Validation Checklist

- `dig +short` for all public hostnames returns Cloudflare addresses only or Cloudflare Tunnel targets.
- `ss -tulpen` confirms sensitive services are not bound on `0.0.0.0` or `[::]` unless explicitly required.
- `docker ps` confirms databases, Coolify, realtime, and management services are not published publicly.
- Unknown Host requests against the local proxy return `421` or `404`, not `200`.
- Public responses include:
  - `Strict-Transport-Security`
  - `Content-Security-Policy`
  - `X-Content-Type-Options`
  - `X-Frame-Options` or frame-ancestors equivalent
  - strict `Referrer-Policy`
  - no `X-Powered-By`
- Sensitive hostnames are blocked by Cloudflare Access before upstream app login.
- Auth and admin paths return `429` under rate-limit test conditions.
- Logs contain real client IPs rather than only Cloudflare edge IPs.

---

## Minimum Safe Baseline

- Rotate all seeded and shared credentials.
- No sensitive Docker service binds on `0.0.0.0`.
- Keep the main app behind Cloudflare only.
- Put dashboards and admin panels behind Cloudflare Access.
- Add default-deny host handling in the reverse proxy.
- Add HSTS, CSP baseline, Permissions-Policy, and remove `X-Powered-By`.
- Configure trusted Cloudflare proxies.
- Restrict internal health-check tooling to admin-only.
- Require MFA for admin access.

---

## Low-Risk Repo Hardening Applied In This Session

The following safe repo-level changes were prepared as part of this review:

- stronger default security headers in `infra/Caddyfile`
- explicit catch-all host rejection for unknown Host values
- removal of `X-Powered-By` from Next.js responses
- admin-only restriction and stricter target validation for `app/api/admin/health/route.ts`

These are safe hardening steps, but live effect still depends on deployment and reload of the running services.

---

## G. Implementation Runbook

### 1. Cloudflare First

- Verify all public customer-facing DNS records are **proxied**.
- Remove any gray-cloud records for dashboards, admin panels, or internal APIs.
- Set SSL/TLS mode to **Full (Strict)**.
- Enable **Always Use HTTPS**.
- Enable **Managed WAF Rules**.
- Add **Cloudflare Access** for:
  - `coolify.getouch.co`
  - `db.getouch.co`
  - `grafana.getouch.co`
  - `wa.getouch.co`
  - all Supabase Studio hostnames
  - any internal admin or control panel hostname
- Add **Rate Limiting Rules** for:
  - `/auth/login`
  - `/auth/register`
  - `/auth/verify`
  - `/api/*`
  - `/webhooks/*`
  - any WA admin paths

### 2. Host Firewall And Port Exposure

- On the main VPS, review all published host ports.
- Change public binds like these to loopback or Tailscale where possible:
  - `8000`
  - `6001`
  - `6002`
  - `3030`
  - `6543`
  - `6544`
  - `6545`
  - `6546`
- Keep the `DOCKER-USER` drop rules in place as defense-in-depth.
- If Cloudflare Tunnel is the real ingress, remove public host access for `80` and `443` from UFW unless truly required.

### 3. Reverse Proxy Hardening

- Deploy the updated `infra/Caddyfile`.
- Reload Caddy safely after validation.
- Confirm unknown Host headers return `421`.
- Confirm HSTS and CSP headers are present externally.
- Add Cloudflare trusted proxy handling next so logs and rate limits use real client IPs.

### 4. App Hardening

- Deploy the updated Next.js app config.
- Confirm `X-Powered-By` is no longer present.
- Confirm `/api/admin/health` now requires an admin session and only probes approved hosts.
- Plan a second pass for:
  - admin MFA
  - shorter admin session TTL
  - login and OTP throttling
  - reducing public WA console exposure

### 5. Secrets And Credentials

- Rotate seeded or documented credentials immediately.
- Remove secret material from:
  - README files
  - seed scripts
  - internal notes stored in repo
  - any copied operational docs
- Invalidate old sessions and tokens after rotation.

---

## H. Host-By-Host Remediation Checklist

### Primary VPS: `100.84.14.93`

- Verify current listeners with `ss -tulpen`.
- Verify current published Docker ports with `docker ps --format`.
- Rebind management and database ports away from `0.0.0.0`.
- Verify `DOCKER-USER` DROP rules still exist for sensitive ports.
- Keep SSH on Tailscale-only and confirm password auth is disabled.
- Reload reverse proxy after config validation.

### Cloudflare Zone: `getouch.co`

- Proxy all public hostnames.
- Put all admin/control-plane hostnames behind Access.
- Enable WAF managed rules and rate limiting.
- Confirm edge-only exposure for the main app.
- Review whether any old DNS records, unused subdomains, or stale CNAMEs still exist.

### Application Layer: `getouch.co`

- Deploy updated app build.
- Confirm no `X-Powered-By` header.
- Confirm admin-only health tooling.
- Review session TTL and add MFA for admin roles.
- Review public routes for debug or operational leakage.

### Operational Surfaces

- `db.getouch.co`: should be Access-protected or IP-restricted.
- `grafana.getouch.co`: should be Access-protected or IP-restricted.
- `wa.getouch.co`: should not expose operator UI publicly.
- `coolify.getouch.co`: keep behind Cloudflare Access.
- Supabase Studio hostnames: Access-protect them.
- `chatwoot.getouch.co` and similar admin apps: protect unless intentionally public.