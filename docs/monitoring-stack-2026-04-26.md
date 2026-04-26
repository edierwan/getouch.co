# Getouch Monitoring Stack

Date: 2026-04-26

## Overview

The production monitoring stack now runs as a repo-managed Docker Compose deployment in `/home/deploy/apps/getouch.co`.

Stack components:
- Grafana: `grafana/grafana-oss:11.6.1`
- Prometheus: `prom/prometheus:v3.5.0`
- Node Exporter: `prom/node-exporter:v1.9.1`
- cAdvisor: `gcr.io/cadvisor/cadvisor:v0.49.1`
- Blackbox Exporter: `prom/blackbox-exporter:v0.25.0`
- NVIDIA DCGM Exporter: `nvcr.io/nvidia/k8s/dcgm-exporter:3.3.9-3.6.1-ubuntu22.04`
- Reverse proxy: Caddy

## Production Paths

Deployment surface:
- Compose project working directory: `/home/deploy/apps/getouch.co`
- Compose file: `/home/deploy/apps/getouch.co/compose.yaml`
- Docker network: `getouch-edge`

Persistence:
- Grafana data: `/data/getouch/grafana`
- Prometheus TSDB: `/data/getouch/prometheus`

Config mounts:
- Prometheus config: `infra/prometheus/prometheus.yml`
- Prometheus alert rules: `infra/prometheus/alerts.yml`
- Blackbox config: `infra/blackbox/blackbox.yml`
- Grafana provisioning root: `infra/grafana/provisioning`
- Grafana dashboard files: `infra/grafana/dashboards`

## Exporters

Enabled exporters:
- `node-exporter` for VPS CPU, RAM, disk, filesystem, and network metrics
- `cadvisor` for Docker/container CPU, memory, and restart-oriented metrics
- `blackbox-exporter` for external HTTPS uptime probes
- `dcgm-exporter` for NVIDIA GPU metrics

GPU confirmation:
- Host has NVIDIA GPU available
- `nvidia-smi` confirmed `NVIDIA GeForce RTX 5060 Ti`
- DCGM exporter image was test-run successfully with GPU access before deployment

Skipped surfaces:
- Traefik metrics were not enabled because Traefik is not used in this stack
- Caddy is the active reverse proxy
- `ollama.getouch.co` was not provisioned as a probe target because the hostname is not currently available
- `ai.getouch.co` is monitored instead as the public AI endpoint

## Prometheus Scrape Targets

Configured scrape jobs:
- `prometheus` -> `prometheus:9090`
- `node-exporter` -> `node-exporter:9100`
- `cadvisor` -> `cadvisor:8080`
- `blackbox-exporter` -> `blackbox-exporter:9115`
- `blackbox-http` -> probes important public HTTPS targets through Blackbox Exporter
- `dcgm-exporter` -> `dcgm-exporter:9400`

Blackbox HTTP targets:
- `https://getouch.co`
- `https://portal.getouch.co`
- `https://grafana.getouch.co`
- `https://n8n.getouch.my`
- `https://dify.getouch.co`
- `https://ai.getouch.co`

## Grafana Provisioning

Provisioned datasource:
- Name: `Prometheus`
- UID: `prometheus`
- URL: `http://prometheus:9090`
- Default datasource: yes

Datasource cleanup:
- Legacy duplicate datasources `prometheus`, `prometheus-1`, and `prometheus-2` are deleted during provisioning
- This cleanup was done after confirming the live Grafana instance only contained default/internal dashboards before migration

Provisioned folders:
- `Infrastructure`
- `Containers`
- `GPU`
- `Uptime`
- `Overview`

## Dashboard List

Provisioned dashboards:
- Infrastructure: `Node Exporter Full` (`1860`)
- Containers: `Cadvisor exporter` (`14282`)
- Containers: `cAdvisor Docker Insights` (`19908`)
- GPU: `NVIDIA DCGM Exporter Dashboard` (`12239`)
- Uptime: `Blackbox Exporter (HTTP prober)` (`13659`)
- Overview: `Getouch Overview` (custom)

Not provisioned:
- Gateway / Traefik dashboard `17346`
- Reason: Traefik is not deployed in this environment

## Getouch Overview Dashboard

The custom `Getouch Overview` dashboard includes:
- Server CPU percent
- RAM usage percent
- Disk usage percent
- Total targets down
- Containers running
- Containers restarted in the last hour
- Top 10 containers by CPU
- Top 10 containers by memory
- GPU utilization percent
- GPU memory percent
- GPU temperature
- Website uptime status table
- HTTP response latency
- HTTP status code table
- Prometheus target health table
- Gateway metrics note explaining why Traefik panels are intentionally absent

Variables:
- `instance`
- `container`
- `target`
- `gpu`

## Alerts

Prometheus alert rules are defined in `infra/prometheus/alerts.yml`.

Configured alerts:
- `HostCpuHigh`
- `HostMemoryHigh`
- `HostDiskHigh`
- `PrometheusTargetDown`
- `HttpProbeDown`
- `GpuTemperatureHigh`
- `ContainerRestartLoop`

Notification routing is intentionally not enabled yet.

## Validation Summary

Successful validation:
- Prometheus active targets are up for `prometheus`, `node-exporter`, `cadvisor`, `blackbox-exporter`, `dcgm-exporter`, and the configured `blackbox-http` probe targets
- Grafana datasource health endpoint returned `OK`
- Grafana folders and dashboards were provisioned successfully
- PromQL `up` returned results
- PromQL `node_cpu_seconds_total` returned results
- PromQL `container_cpu_usage_seconds_total` returned results
- PromQL `probe_success` returned results
- PromQL `DCGM_FI_DEV_GPU_UTIL` returned results

Current probe result requiring attention:
- `https://n8n.getouch.my` currently returns `probe_success = 0`
- Other configured probe targets returned success

Prometheus target counts observed during validation:
- `prometheus`: `1`
- `node-exporter`: `1`
- `cadvisor`: `1`
- `blackbox-exporter`: `1`
- `dcgm-exporter`: `1`
- `blackbox-http`: `6` targets scraped

## How To Add A New Uptime Target

1. Edit `infra/prometheus/prometheus.yml`.
2. Add the new HTTPS URL under the `blackbox-http` `static_configs` target list.
3. Sync the file to the host.
4. Recreate Prometheus with `docker compose up -d prometheus` from `/home/deploy/apps/getouch.co`.
5. Confirm the new target appears in Prometheus target health and the Uptime folder dashboards.

## How To Debug Empty Dashboard Panels

Check in this order:
1. Confirm Grafana datasource health through `/api/datasources/uid/prometheus/health`.
2. Confirm Prometheus target health through `/api/v1/targets`.
3. Run the panel's underlying PromQL directly in Prometheus.
4. Confirm the panel dashboard JSON is provisioned and present in Grafana search.
5. Confirm the dashboard references the provisioned datasource UID `prometheus` or name `Prometheus`.

Common causes:
- Exporter container not running
- Prometheus scrape target down
- Wrong datasource UID after dashboard import
- Blackbox target URL unreachable from the VPS
- GPU dashboard loaded before DCGM metrics exist

## How To Confirm GPU Metrics

1. Confirm host GPU visibility with `nvidia-smi`.
2. Confirm `dcgm-exporter` is running.
3. Run PromQL `DCGM_FI_DEV_GPU_UTIL`.
4. Open the `GPU` folder dashboards in Grafana.

## Grafana Access

Public URL:
- `https://grafana.getouch.co`

Current root URL setting:
- `GF_SERVER_ROOT_URL=https://grafana.getouch.co`

Authentication:
- Local admin auth remains enabled
- User signup is disabled
