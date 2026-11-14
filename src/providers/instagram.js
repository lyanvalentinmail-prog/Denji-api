import * as cheerio from 'cheerio';
import { getText, getJson } from '../core/http.js';
import { upstream } from '../core/errors.js';

/** Extrae el shortcode de un enlace de Instagram (reel, p, tv). */
export function instagramId(url) {
  const m = /\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/.exec(url.pathname);
  if (m) return m[1];
  const short = /([A-Za-z0-9_-]{6,})\/?$/.exec(url.pathname);
  return short ? short[1] : null;
}

const EMBED_TYPES = ['reel', 'p'];

/**
 * Descarga un Reel o post de Instagram sin marca de agua
 * usando la vista publica /embed/captioned, que no requiere sesion.
 */
export async function instagramInfo(url) {
  const id = instagramId(url);
  if (!id) throw upstream('Instagram', 'No se pudo extraer el id del enlace.');

  const errors = [];
  for (const type of EMBED_TYPES) {
    for (const suffix of ['captioned', '']) {
      const target = `https://www.instagram.com/${type}/${id}/embed/${suffix}`.replace(/\/$/, '');
      try {
        const html = await getText(target, { provider: 'Instagram', timeout: 15000 });
        const parsed = parseEmbed(html, id);
        if (parsed) return parsed;
      } catch (err) {
        errors.push(err.message);
      }
    }
  }
  throw upstream('Instagram', 'No se pudo resolver el contenido (puede ser privado o eliminado).', {
    id,
    hint: 'Solo funciona con contenido publico.',
    failures: errors.slice(0, 2),
  });
}

function parseEmbed(html, id) {
  const $ = cheerio.load(html);

  const videoUrl =
    $('video').attr('src') ||
    $('video source').attr('src') ||
    (/"video_url":"(.*?)"/.exec(html) || [])[1]?.replace(/\\u0026/g, '&') ||
    null;

  const images = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    if (src && /scontent|cdninstagram/.test(src) && !/profile|static|logo/i.test(src)) images.push(src);
  });

  const caption =
    $('meta[property="og:title"]').attr('content') ||
    (/"edge_media_to_caption"[\s\S]{0,400}?"text":"(.*?)"/.exec(html) || [])[1] ||
    $('.Caption p, .CaptionComments').first().text().trim() ||
    null;

  const author = (/"username":"(.*?)"/.exec(html) || [])[1] || $('a.EmbedPostProfileImage').attr('title') || null;
  const thumbnail = $('meta[property="og:image"]').attr('content') || images[0] || null;

  if (!videoUrl && !images.length) return null;

  return {
    id,
    type: videoUrl ? 'video' : 'image',
    caption: caption?.replace(/\\n/g, ' ').slice(0, 500) ?? null,
    author: author ? { username: author, url: `https://www.instagram.com/${author}/` } : null,
    thumbnail,
    video: videoUrl ? { noWatermark: videoUrl, hd: videoUrl } : null,
    images: images.length ? [...new Set(images)] : null,
    url: `https://www.instagram.com/reel/${id}/`,
    source: 'instagram.com/embed',
  };
}

/** Intento adicional via API publica de Instagram (suele requerir sesion). */
export async function instagramGraph(id) {
  try {
    const json = await getJson(`https://www.instagram.com/api/v1/media/${id}/info/`, { provider: 'Instagram' });
    return json?.items?.[0] ?? null;
  } catch {
    return null;
  }
}
