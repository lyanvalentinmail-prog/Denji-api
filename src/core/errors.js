/**
 * Errores tipados de la API.
 * Todo lo que lanza un handler se convierte en un sobre JSON coherente.
 */
export class ApiError extends Error {
  /**
   * @param {number} status  Codigo HTTP
   * @param {string} code    Codigo estable y legible por maquina
   * @param {string} message Mensaje legible por humanos
   * @param {object} [details] Datos extra opcionales
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    const body = { code: this.code, message: this.message };
    if (this.details !== undefined) body.details = this.details;
    return body;
  }
}

export const badRequest = (msg, details) => new ApiError(400, 'BAD_REQUEST', msg, details);
export const missingParam = (name) =>
  new ApiError(400, 'MISSING_PARAM', `Falta el parametro obligatorio "${name}".`, { param: name });
export const invalidParam = (name, reason) =>
  new ApiError(400, 'INVALID_PARAM', `El parametro "${name}" no es valido${reason ? `: ${reason}` : '.'}`, {
    param: name,
  });
export const notFound = (what) => new ApiError(404, 'NOT_FOUND', what);
export const forbidden = (msg) => new ApiError(403, 'FORBIDDEN', msg);
export const tooManyRequests = (retryAfter) =>
  new ApiError(429, 'RATE_LIMITED', 'Demasiadas peticiones, espera un momento.', { retryAfter });

/** El proveedor externo fallo o no contesto como esperabamos. */
export const upstream = (provider, message, details) =>
  new ApiError(502, 'UPSTREAM_ERROR', `[${provider}] ${message}`, { provider, ...details });

/** Falta una API key en el entorno. */
export const missingKey = (envVar, provider) =>
  new ApiError(503, 'MISSING_API_KEY', `Falta la variable de entorno ${envVar} para usar ${provider}.`, {
    envVar,
    provider,
  });
