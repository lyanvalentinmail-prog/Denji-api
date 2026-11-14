import * as cheerio from 'cheerio';
import { getText } from '../core/http.js';
import { upstream } from '../core/errors.js';

/** Normaliza un enlace de Mediafire a la forma canonica. */
export function mediafireId(url) {
  const m = /mediafire\.com\/(?:file\/)?([A-Za-z0-9]+)(?:\/([^/?#]+))?/i.exec(url.href);
  return m ? { id: m[1], filename: m[2] ? decodeURIComponent(m[2]) : null } : null;
}

/**
 * Resuelve el enlace directo de descarga de Mediafire.
 * Mediafire ya entrega el archivo sin marcas de agua.
 */
export async function mediafireInfo(url) {
  const ref = mediafireId(url);
  if (!ref) throw upstream('Mediafire', 'El enlace no parece de Mediafire.');

  const html = await getText(`https://www.mediafire.com/file/${ref.id}/file`, {
    provider: 'Mediafire',
    retries: 1,
  });
  const $ = cheerio.load(html);

  const direct =
    $('#downloadButton').attr('href') ||
    $('a[aria-label^="Download file"]').attr('href') ||
    $('button#downloadButton').attr('href') ||
    null;

  if (!direct) {
    const reason = /removed|not found|does not exist/i.test(html) ? 'El archivo fue eliminado o no existe.' : null;
    throw upstream('Mediafire', reason ?? 'No se encontro el boton de descarga.', { id: ref.id });
  }

  const name = $('.dl-btn-label').text().trim() || $('h1.legend, .filename').first().text().trim() || ref.filename;
  const size = $('.dl-btn-cont .variable-size, .variable-size').first().text().trim() || null;
  const uploaded = $('.dl-info .details .date, .date').first().text().trim() || null;

  return {
    id: ref.id,
    filename: name || null,
    size: size || null,
    uploaded: uploaded || null,
    directUrl: direct.trim(),
    watermark: false,
    page: `https://www.mediafire.com/file/${ref.id}/file`,
    source: 'mediafire.com',
  };
}
