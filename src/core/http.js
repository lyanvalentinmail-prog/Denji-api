import { upstream } from './errors.js';

export const USER_AGENT =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT = Number(process.env.UPSTREAM_TIMEOUT_MS || 20000);

/** fetch nativo con timeout, reintentos y User-Agent de navegador. */
export async function request(url, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = Number(options.retries ?? 0),
    provider = 'upstream',
    headers,
    ...rest
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        redirect: options.redirect ?? 'follow',
        ...rest,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/json, text/plain, */*',
          'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
          ...headers,
        },
        signal: controller.signal,
      });
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(400 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw upstream(provider, `No se pudo contactar al proveedor: ${lastError?.message || 'sin respuesta'}`);
}

/** GET que espera JSON. */
export async function getJson(url, options = {}) {
  const provider = options.provider ?? new URL(url).hostname;
  const res = await request(url, options);
  if (!res.ok) {
    throw upstream(provider, `Respondio con HTTP ${res.status}`, { url: safeUrl(url), status: res.status });
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw upstream(provider, 'Respondio un cuerpo que no es JSON valido.', { url: safeUrl(url) });
  }
}

/** GET que espera texto/HTML. */
export async function getText(url, options = {}) {
  const provider = options.provider ?? new URL(url).hostname;
  const res = await request(url, options);
  if (!res.ok) {
    throw upstream(provider, `Respondio con HTTP ${res.status}`, { url: safeUrl(url), status: res.status });
  }
  return res.text();
}

/** POST JSON que espera JSON. */
export async function postJson(url, body, options = {}) {
  const provider = options.provider ?? new URL(url).hostname;
  const res = await request(url, {
    ...options,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...options.headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const detail = parsed?.error?.message || parsed?.message || parsed?.raw || `HTTP ${res.status}`;
    throw upstream(provider, String(detail), { status: res.status });
  }
  return parsed;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return String(url).slice(0, 120);
  }
}

/** Construye una URL con query params, omitiendo vacios. */
export function buildUrl(base, params = {}) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}
