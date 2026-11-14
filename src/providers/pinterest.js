import { getJson, buildUrl } from '../core/http.js';
import { upstream } from '../core/errors.js';

/** Extrae el id de un pin desde su URL. */
export function pinterestId(url) {
  const m = /\/pin\/(\d+)/.exec(url.pathname);
  if (m) return m[1];
  const m2 = /pinterest\.[a-z.]+\/([A-Za-z0-9]{5,})/i.exec(url.href);
  return m2 ? m2[1] : null;
}

/**
 * Resuelve un pin de Pinterest: video sin marca de agua o imagen en maxima resolucion.
 */
export async function pinterestPin(url) {
  const id = pinterestId(url);
  if (!id) throw upstream('Pinterest', 'No se pudo extraer el id del pin.');

  const data = {
    options: { id, field_set_key: 'detailed' },
    context: {},
  };
  const target = buildUrl('https://www.pinterest.com/resource/PinResource/get/', {
    source_url: `/pin/${id}/`,
    data: JSON.stringify(data),
    _: Date.now(),
  });

  const json = await getJson(target, {
    provider: 'Pinterest',
    headers: {
      accept: 'application/json, text/javascript, */*, q=0.01',
      'x-requested-with': 'XMLHttpRequest',
      referer: `https://www.pinterest.com/pin/${id}/`,
    },
    retries: 1,
  });

  const pin = json?.resource_response?.data;
  if (!pin) throw upstream('Pinterest', 'La API interna no devolvio el pin.', { id });

  const variants = pin.videos?.video_list ? Object.values(pin.videos.video_list) : [];
  const best = variants.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  const orig = pin.images?.orig?.url ?? null;

  return {
    id,
    title: pin.grid_title || pin.title || null,
    description: pin.description ?? null,
    author: pin.pinner ? { username: pin.pinner.username, name: pin.pinner.full_name } : null,
    thumbnail: pin.images?.orig?.url ?? null,
    duration: pin.videos?.duration ?? null,
    video: best ? { noWatermark: best.url, hd: best.url, quality: `${best.width}x${best.height}`, size: best.size } : null,
    image: orig,
    url: `https://www.pinterest.com/pin/${id}/`,
    source: 'pinterest.com',
  };
}

/** Busqueda de pines. */
export async function pinterestSearch(query, { limit = 20 } = {}) {
  const payload = {
    options: { query, scope: 'pins', page_size: Math.min(limit, 50), no_fetch_context_on_resource: false },
    context: {},
  };
  const target = buildUrl('https://www.pinterest.com/resource/BaseSearchResource/get/', {
    source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
    data: JSON.stringify(payload),
    _: Date.now(),
  });

  const json = await getJson(target, {
    provider: 'Pinterest',
    headers: {
      accept: 'application/json, text/javascript, */*, q=0.01',
      'x-requested-with': 'XMLHttpRequest',
      referer: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
    },
  });

  const pins = (json?.resource_response?.data?.results ?? [])
    .filter((p) => p?.id)
    .slice(0, limit)
    .map((p) => {
      const variants = p.videos?.video_list ? Object.values(p.videos.video_list) : [];
      const best = variants.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
      return {
        id: p.id,
        title: p.grid_title || p.title || null,
        description: p.description ?? null,
        image: p.images?.orig?.url ?? p.images?.['736x']?.url ?? null,
        video: best?.url ?? null,
        author: p.pinner?.username ?? null,
        url: `https://www.pinterest.com/pin/${p.id}/`,
      };
    });

  return { query, total: pins.length, pins };
}
