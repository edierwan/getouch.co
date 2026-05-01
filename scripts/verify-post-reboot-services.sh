#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-deploy@100.84.14.93}"
HOST_HEADER="${HOST_HEADER:-portal.getouch.co}"

ssh "$TARGET" "HOST_HEADER='$HOST_HEADER' bash -s" <<'SH'
set -euo pipefail

echo "== boot =="
who -b || true

echo
echo "== portal build info =="
curl -fsS -H "Host: ${HOST_HEADER}" http://127.0.0.1/api/build-info || true

echo
echo "== core containers =="
portal_container="$(docker ps --filter label=coolify.applicationId=2 --format '{{.Names}}' | head -n1 || true)"
if [[ -n "$portal_container" ]]; then
	docker inspect --format "{{.Name}}|restart={{.HostConfig.RestartPolicy.Name}}|health={{if .Config.Healthcheck}}yes{{else}}no{{end}}|status={{.State.Status}}|started={{.State.StartedAt}}" "$portal_container" 2>/dev/null || echo "$portal_container|missing"
else
	echo "coolify-app-2|missing"
fi
for container in ollama open-webui open-webui-pipelines baileys-gateway caddy getouch-postgres getouch-pgadmin searxng; do
	docker inspect --format "{{.Name}}|restart={{.HostConfig.RestartPolicy.Name}}|health={{if .Config.Healthcheck}}yes{{else}}no{{end}}|status={{.State.Status}}|started={{.State.StartedAt}}" "$container" 2>/dev/null || echo "$container|missing"
done

echo
echo "== vllm state =="
docker inspect --format "{{.Name}}|status={{.State.Status}}|restart={{.HostConfig.RestartPolicy.Name}}" vllm-qwen3-14b-fp8 2>/dev/null || echo "vllm-qwen3-14b-fp8|missing"

echo
echo "== open webui provider env =="
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' open-webui 2>/dev/null \
	| grep -E '^(OLLAMA_BASE_URL|OPENAI_API_BASE_URLS|OPENAI_API_KEYS|DEFAULT_MODELS|WEBUI_NAME)=' || true

echo
echo "== assistant pipeline models =="
PIPELINES_API_KEY="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' open-webui-pipelines 2>/dev/null | sed -n 's/^PIPELINES_API_KEY=//p' | head -n 1)"
if [[ -n "$PIPELINES_API_KEY" ]]; then
	docker exec open-webui-pipelines python3 -c "import urllib.request; req=urllib.request.Request('http://127.0.0.1:9099/v1/models', headers={'Authorization': 'Bearer ${PIPELINES_API_KEY}'}); resp=urllib.request.urlopen(req, timeout=20); print(resp.read().decode())" || true
else
	echo "PIPELINES_API_KEY not configured"
fi

echo
echo "== deploy user crontab =="
(crontab -l 2>/dev/null || true) | grep -Ein 'scheduled|shutdown|reboot|GetTouch' || true
SH