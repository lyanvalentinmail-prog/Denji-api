import { missingParam, invalidParam } from './errors.js';

/** Lee un parametro obligatorio de query o body. */
export function required(req, name, aliases = []) {
  for (const key of [name, ...aliases]) {
    const value = req.query?.[key] ?? req.body?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  throw missingParam(name);
}

/** Lee un parametro opcional con valor por defecto. */
export function optional(req, name, fallback = undefined, aliases = []) {
  for (const key of [name, ...aliases]) {
    const value = req.query?.[key] ?? req.body?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return fallback;
}

/** Numero entero dentro de un rango. */
export function intParam(req, name, { fallback = 1, min = 1, max = 50, aliases = [] } = {}) {
  const raw = optional(req, name, undefined, aliases);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) throw invalidParam(name, 'debe ser un numero entero');
  return Math.min(max, Math.max(min, value));
}

/** Booleano desde query: 1/true/yes/si/on. */
export function boolParam(req, name, fallback = false, aliases = []) {
  const raw = optional(req, name, undefined, aliases);
  if (raw === undefined) return fallback;
  return /^(1|true|yes|si|s|on)$/i.test(raw);
}

/** Valida que sea una URL http(s). */
export function requiredUrl(req, name = 'url') {
  const raw = required(req, name);
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw invalidParam(name, 'debe ser una URL valida');
  }
  if (!/^https?:$/.test(parsed.protocol)) throw invalidParam(name, 'solo se aceptan URL http o https');
  return parsed;
}

/** Limita la longitud de un texto. */
export function limit(text, max = 4000) {
  const value = String(text ?? '');
  return value.length > max ? value.slice(0, max) : value;
}
