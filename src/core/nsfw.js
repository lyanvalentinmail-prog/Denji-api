/**
 * Puerta de acceso al contenido NSFW.
 *
 * La web trae el interruptor apagado por defecto y solo lo enciende tras una
 * confirmacion explicita de edad. Cuando esta encendido envia el token por query
 * (`nsfw=1`) o por cabecera (`x-denji-nsfw: 1`).
 *
 * En el servidor se puede forzar el bloqueo total con NSFW_DISABLED=1,
 * util para entornos donde este contenido no debe servirse.
 */
export const NSFW_HEADER = 'x-denji-nsfw';

const TRUTHY = /^(1|true|yes|si|s|on)$/i;

export function nsfwRequested(req) {
  if (TRUTHY.test(String(req.query?.nsfw ?? ''))) return true;
  if (TRUTHY.test(String(req.headers[NSFW_HEADER] ?? ''))) return true;
  return false;
}

export function nsfwHardDisabled() {
  return TRUTHY.test(String(process.env.NSFW_DISABLED ?? ''));
}

export function nsfwGate(req, res, next) {
  if (nsfwHardDisabled()) {
    return res.status(403).json({
      status: false,
      creator: 'Denji',
      endpoint: req.baseUrl + req.path,
      error: {
        code: 'NSFW_DISABLED',
        message: 'El contenido NSFW esta deshabilitado en este servidor.',
      },
    });
  }
  if (!nsfwRequested(req)) {
    return res.status(403).json({
      status: false,
      creator: 'Denji',
      endpoint: req.baseUrl + req.path,
      error: {
        code: 'NSFW_LOCKED',
        message:
          'Los endpoints NSFW estan desactivados. Activa el interruptor de la web o agrega ?nsfw=1 confirmando que eres mayor de edad.',
        details: { hint: `Anade nsfw=1 a la URL o envia la cabecera ${NSFW_HEADER}: 1` },
      },
    });
  }
  return next();
}
