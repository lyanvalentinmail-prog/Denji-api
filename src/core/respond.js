import { ApiError } from './errors.js';

export const BRAND = {
  name: 'Denji API',
  creator: 'Denji',
  repo: 'https://github.com/lyanvalentinmail-prog/Denji-api',
};

/** Sobre de exito comun a todos los endpoints. */
export function ok(res, data, extra = {}) {
  return res.json({
    status: true,
    creator: BRAND.creator,
    endpoint: res.req.baseUrl + res.req.path,
    took: res.locals.tookMs ? Date.now() - res.locals.tookMs : undefined,
    ...extra,
    data,
  });
}

/** Sobre de error comun a todos los endpoints. */
export function fail(res, status, code, message, details) {
  const body = {
    status: false,
    creator: BRAND.creator,
    endpoint: res.req.baseUrl + res.req.path,
    error: { code, message },
  };
  if (details !== undefined) body.error.details = details;
  return res.status(status).json(body);
}

/** Traduce cualquier valor lanzado por un handler a una respuesta HTTP. */
export function toResponse(err, req, res) {
  if (err instanceof ApiError) {
    return fail(res, err.status, err.code, err.message, err.details);
  }
  if (err && err.name === 'AbortError') {
    return fail(res, 504, 'UPSTREAM_TIMEOUT', 'El proveedor externo tardo demasiado en responder.');
  }
  const message = process.env.NODE_ENV === 'production' ? 'Error interno del servidor.' : String(err?.message || err);
  return fail(res, 500, 'INTERNAL_ERROR', message);
}
