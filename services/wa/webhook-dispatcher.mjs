/**
 * WebhookDispatcher — signs and delivers gateway events to WAPI.
 *
 * Events: qr | connected | disconnected | message.inbound | message.status |
 * session.deleted | session.error.
 *
 * Body shape:
 *   { sessionId, type, payload, timestamp }
 *
 * Signing: HMAC-SHA256 over the raw JSON body, hex-encoded, sent in the
 * `X-WA-Signature` header. WAPI verifies the same way.
 *
 * Retry: exponential backoff (5s, 15s, 1m, 5m, 15m, 1h, capped 1h),
 * dropped after 24h. Queue is in-memory only — persistent disk-backed
 * retry is documented as pending in Request 05.
 */

import crypto from 'node:crypto';

const RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 300_000, 900_000, 3_600_000];
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_QUEUE = 1000;

export class WebhookDispatcher {
  constructor({ url, secret, logger }) {
    this.url = url || '';
    this.secret = secret || '';
    this.logger = logger;
    this.queue = [];
    this.processing = false;
    this.stats = {
      delivered: 0,
      failed: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureMessage: null,
    };
  }

  isEnabled() {
    return Boolean(this.url && this.secret);
  }

  enqueue(sessionId, type, payload) {
    if (!this.isEnabled()) return;
    if (this.queue.length >= MAX_QUEUE) {
      this.logger.warn({ queue: this.queue.length }, 'webhook queue full — dropping oldest');
      this.queue.shift();
    }
    const event = {
      sessionId,
      type,
      payload: payload || {},
      timestamp: new Date().toISOString(),
    };
    this.queue.push({ event, attempts: 0, firstQueuedAt: Date.now(), nextAttemptAt: Date.now() });
    this._kick();
  }

  _kick() {
    if (this.processing) return;
    this.processing = true;
    queueMicrotask(() => this._drain().catch(() => { this.processing = false; }));
  }

  async _drain() {
    try {
      while (this.queue.length) {
        const head = this.queue[0];
        const now = Date.now();
        if (now - head.firstQueuedAt > MAX_AGE_MS) {
          this.queue.shift();
          this.stats.failed += 1;
          this.stats.lastFailureAt = new Date().toISOString();
          this.stats.lastFailureMessage = 'dropped after 24h';
          this.logger.warn({ sessionId: head.event.sessionId, type: head.event.type }, 'webhook dropped after 24h');
          continue;
        }
        if (head.nextAttemptAt > now) {
          const delay = head.nextAttemptAt - now;
          await new Promise((r) => setTimeout(r, Math.min(delay, 1000)));
          continue;
        }
        const ok = await this._send(head.event);
        if (ok) {
          this.queue.shift();
          this.stats.delivered += 1;
          this.stats.lastSuccessAt = new Date().toISOString();
        } else {
          head.attempts += 1;
          const delay = RETRY_DELAYS_MS[Math.min(head.attempts - 1, RETRY_DELAYS_MS.length - 1)];
          head.nextAttemptAt = Date.now() + delay;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  async _send(event) {
    const body = JSON.stringify(event);
    const signature = crypto.createHmac('sha256', this.secret).update(body).digest('hex');
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WA-Signature': signature,
        },
        body,
      });
      if (!res.ok) {
        this.stats.lastFailureAt = new Date().toISOString();
        this.stats.lastFailureMessage = `status ${res.status}`;
        return false;
      }
      return true;
    } catch (err) {
      this.stats.lastFailureAt = new Date().toISOString();
      this.stats.lastFailureMessage = err.message || 'network error';
      return false;
    }
  }

  snapshot() {
    return {
      enabled: this.isEnabled(),
      url: this.url || null,
      queueSize: this.queue.length,
      stats: { ...this.stats },
    };
  }
}
