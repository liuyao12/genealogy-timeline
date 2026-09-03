import { DEFAULT_MAX_REQUESTS, DEFAULT_REQUEST_DELAY_MS } from './geni-config.js?v=1';
import { canonicalGeniProfileId, clean, refId } from './geni-model.js?v=1';

function sleep(milliseconds) {
  return new Promise(resolve => globalThis.setTimeout(resolve, milliseconds));
}

function payloadMessage(payload) {
  return clean([
    payload?.error?.message,
    typeof payload?.error === 'string' ? payload.error : '',
    payload?.error?.type,
    payload?.error?.code,
    payload?.message
  ].filter(Boolean).join(' ')).replace(/[_-]+/g, ' ');
}

export function payloadClassification(payload) {
  const hasError = payload?.error != null || ['error', 'unauthorized'].includes(clean(payload?.status).toLowerCase());
  if (!hasError) return null;
  const message = payloadMessage(payload);
  if (!message) return { code: 'GENI_API_ERROR', message: 'Geni returned an API error.', retryable: false };
  if (/invalid.*access.*token|access.*token.*invalid|expired.*access.*token/i.test(message)) {
    return { code: 'GENI_INVALID_ACCESS_TOKEN', message: 'Geni authorization has expired.', retryable: false };
  }
  if (/rate.?limit|too many requests|request limit|throttl/i.test(message) || Number(payload?.error?.code) === 429) {
    return { code: 'GENI_RATE_LIMIT', message: 'Geni is temporarily rate limiting requests.', retryable: true };
  }
  return { code: 'GENI_API_ERROR', message: message || 'Geni returned an API error.', retryable: false };
}

export class GeniApiError extends Error {
  constructor(message, code, options = {}) {
    super(message);
    this.name = 'GeniApiError';
    this.code = code;
    this.retryable = options.retryable === true;
    this.payload = options.payload;
  }
}

export class GeniJsonpClient {
  constructor({ token, minDelayMs = DEFAULT_REQUEST_DELAY_MS, maxRequests = DEFAULT_MAX_REQUESTS, maxRetries = 4, onProgress = () => {} } = {}) {
    this.token = clean(token);
    this.minDelayMs = Math.max(0, Number(minDelayMs) || 0);
    this.maxRequests = Math.max(1, Number(maxRequests) || DEFAULT_MAX_REQUESTS);
    this.maxRetries = Math.max(0, Number(maxRetries) || 0);
    this.onProgress = onProgress;
    this.requestCount = 0;
    this.lastRequestAt = 0;
    this.queue = Promise.resolve();
    this.cache = new Map();
    this.inFlight = new Map();
    this.cancelled = false;
  }

  cancel() {
    this.cancelled = true;
  }

  request(path, params = {}) {
    if (!this.token) return Promise.reject(new GeniApiError('Geni authorization is required.', 'GENI_AUTH_REQUIRED'));
    const keyParams = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
    const key = `${path}?${keyParams}`;
    if (this.cache.has(key)) return Promise.resolve(structuredClone(this.cache.get(key)));
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    const job = this.queue.then(() => this.#requestWithRetry(path, params));
    this.queue = job.catch(() => {});
    this.inFlight.set(key, job);
    return job.then(payload => {
      this.cache.set(key, structuredClone(payload));
      return payload;
    }).finally(() => this.inFlight.delete(key));
  }

  async #requestWithRetry(path, params) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (this.cancelled) throw new GeniApiError('Geni import stopped.', 'GENI_CANCELLED');
      if (this.requestCount >= this.maxRequests) {
        throw new GeniApiError(`The ${this.maxRequests}-request safety limit was reached.`, 'GENI_REQUEST_LIMIT');
      }
      const spacing = Math.max(0, this.minDelayMs - (Date.now() - this.lastRequestAt));
      if (spacing) await sleep(spacing);
      try {
        const payload = await this.#requestOnce(path, params);
        const classification = payloadClassification(payload);
        if (classification?.retryable) {
          throw new GeniApiError(classification.message, classification.code, { retryable: true, payload });
        }
        if (classification?.code === 'GENI_INVALID_ACCESS_TOKEN') {
          throw new GeniApiError(classification.message, classification.code, { payload });
        }
        return payload;
      } catch (error) {
        lastError = error;
        const retryable = error?.retryable === true || ['GENI_NETWORK_ERROR', 'GENI_TIMEOUT', 'GENI_RATE_LIMIT'].includes(error?.code);
        if (!retryable || attempt >= this.maxRetries) throw error;
        const delay = Math.min(12000, 1000 * (2 ** attempt));
        this.onProgress({ phase: 'backoff', requestCount: this.requestCount, retryInMs: delay, message: error.message });
        await sleep(delay);
      }
    }
    throw lastError || new GeniApiError('Geni request failed.', 'GENI_API_ERROR');
  }

  #requestOnce(path, params) {
    return new Promise((resolve, reject) => {
      const callbackName = `__lineageGeniBatch${cryptoId().replace(/-/g, '')}`;
      const script = document.createElement('script');
      let settled = false;
      const finish = (error, payload) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        script.remove();
        delete window[callbackName];
        if (error) reject(error);
        else resolve(payload);
      };
      const timer = window.setTimeout(() => {
        finish(new GeniApiError('Geni did not respond before the request timed out.', 'GENI_TIMEOUT', { retryable: true }));
      }, 25000);
      window[callbackName] = payload => finish(null, payload);
      script.onerror = () => finish(new GeniApiError('The Geni request could not be loaded.', 'GENI_NETWORK_ERROR', { retryable: true }));
      const query = new URLSearchParams({ ...params, access_token: this.token, callback: callbackName });
      script.src = `https://www.geni.com/api/${path}?${query}`;
      this.requestCount += 1;
      this.lastRequestAt = Date.now();
      this.onProgress({ phase: 'request', requestCount: this.requestCount, path });
      document.head.append(script);
    });
  }
}

export function cryptoId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function resourceRecords(payload, prefix, collectionNames) {
  if (payload && typeof payload === 'object' && refId(payload.id || payload.url).startsWith(prefix)) return [payload];
  let collection = payload;
  for (const name of collectionNames) {
    if (payload?.[name] != null) {
      collection = payload[name];
      break;
    }
  }
  if (Array.isArray(collection)) return collection.filter(item => item && typeof item === 'object');
  if (!collection || typeof collection !== 'object') return [];
  return Object.entries(collection).map(([key, value]) => (
    value && typeof value === 'object' ? { ...value, id: value.id || refId(key) } : null
  )).filter(item => item && refId(item.id || item.url).startsWith(prefix));
}

export function profileRecords(payload) {
  return resourceRecords(payload, 'profile-', ['results', 'profiles']);
}

export function unionRecords(payload) {
  return resourceRecords(payload, 'union-', ['results', 'unions']);
}

export function apiProfileIdentifier(value) {
  const id = canonicalGeniProfileId(value);
  return /^profile-/i.test(id) ? id : '';
}

export function stripResourcePrefix(value, prefix) {
  return clean(value).replace(new RegExp(`^${prefix}-`, 'i'), '');
}
