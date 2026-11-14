import { getJson } from '../core/http.js';
import { upstream } from '../core/errors.js';

/**
 * YouTube sin clave de API, usando instancias publicas de Piped e Invidious.
 * Se recorren en orden hasta que una responda; la lista es configurable por env.
 */
const DEFAULT_PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
];

const DEFAULT_INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
];

export function pipedInstances() {
  return (process.env.PIPED_INSTANCES || DEFAULT_PIPED.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
}

export function invidiousInstances() {
  return (process.env.INVIDIOUS_INSTANCES || DEFAULT_INVIDIOUS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Extrae el id de un video desde cualquier forma de URL de YouTube. */
export function youtubeId(input) {
  const raw = String(input);
  const patterns = [
    /(?:v=|\/videos\/|embed\/|shorts\/|live\/|youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const re of patterns) {
    const m = re.exec(raw);
    if (m) return m[1];
  }
  return null;
}

async function fromPiped(instance, id) {
  const json = await getJson(`${instance}/streams/${id}`, { provider: 'Piped', timeout: 15000 });
  if (!json?.title) throw upstream('Piped', 'Respuesta sin titulo.');
  const formats = [...(json.videoStreams ?? []), ...(json.audioStreams ?? [])]
    .filter((s) => s?.url)
    .map((s) => ({
      quality: s.quality,
      mimeType: s.mimeType,
      hasAudio: s.videoOnly === false || /audio/i.test(s.mimeType || ''),
      videoOnly: Boolean(s.videoOnly),
      bitrate: s.bitrate ?? null,
      size: s.contentLength ?? null,
      url: s.url,
    }));
  return {
    id,
    provider: 'piped',
    instance,
    title: json.title,
    description: json.description ?? null,
    channel: { name: json.uploader ?? null, url: json.uploaderUrl ?? null, avatar: json.uploaderAvatar ?? null },
    thumbnail: json.thumbnailUrl ?? null,
    duration: json.duration ?? null,
    views: json.views ?? null,
    likes: json.likes ?? null,
    uploadedAt: json.uploadDate ?? null,
    isShort: (json.duration ?? 0) > 0 && json.duration <= 180,
    formats,
  };
}

async function fromInvidious(instance, id) {
  const json = await getJson(`${instance}/api/v1/videos/${id}?fields=title,author,authorThumbnails,published,lengthSeconds,viewCount,likeCount,adaptiveFormats,formatStreams,thumbnail,description`, {
    provider: 'Invidious',
    timeout: 15000,
  });
  if (!json?.title) throw upstream('Invidious', 'Respuesta sin titulo.');
  const formats = [...(json.formatStreams ?? []), ...(json.adaptiveFormats ?? [])]
    .filter((f) => f?.url)
    .map((f) => ({
      quality: f.qualityLabel || f.quality || f.container,
      mimeType: f.type ?? null,
      hasAudio: !f.videoOnly,
      videoOnly: Boolean(f.videoOnly),
      size: f.size ?? null,
      url: f.url,
    }));
  return {
    id,
    provider: 'invidious',
    instance,
    title: json.title,
    description: json.description ?? null,
    channel: { name: json.author ?? null, url: `${instance}/channel/${json.authorId ?? ''}`, avatar: json.authorThumbnails?.[0]?.url ?? null },
    thumbnail: json.thumbnail ?? null,
    duration: json.lengthSeconds ?? null,
    views: json.viewCount ?? null,
    likes: json.likeCount ?? null,
    uploadedAt: json.published ? new Date(json.published * 1000).toISOString() : null,
    isShort: (json.lengthSeconds ?? 0) > 0 && json.lengthSeconds <= 180,
    formats,
  };
}

/** Devuelve metadatos + URLs de descarga de un video de YouTube. */
export async function youtubeInfo(input, { preferShort = false } = {}) {
  const id = youtubeId(input);
  if (!id) throw upstream('YouTube', 'No se pudo extraer el id del video de la URL.');

  const attempts = [];
  for (const instance of pipedInstances()) attempts.push(() => fromPiped(instance, id));
  for (const instance of invidiousInstances()) attempts.push(() => fromInvidious(instance, id));

  const failures = [];
  for (const attempt of attempts) {
    try {
      const info = await attempt();
      if (preferShort && !info.isShort) {
        // Se pidio un Short pero el video es largo: igual se entrega, marcado.
        info.shortWarning = 'El enlace no parece un Short (dura mas de 180s).';
      }
      return info;
    } catch (err) {
      failures.push(err.message);
    }
  }
  throw upstream('YouTube', `Ninguna instancia publica pudo resolver el video ${id}.`, {
    id,
    tried: attempts.length,
    hint: 'Configura PIPED_INSTANCES o INVIDIOUS_INSTANCES con instancias propias.',
    failures: failures.slice(0, 3),
  });
}

/** Busqueda en YouTube parseando el HTML publico. */
export async function youtubeSearch(query, { limit = 15 } = {}) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=es&gl=US`;
  const html = await (await import('../core/http.js')).getText(url, { provider: 'YouTube' });
  const match = /var ytInitialData = (\{.*?\});<\/script>/s.exec(html);
  if (!match) throw upstream('YouTube', 'No se encontro ytInitialData en la respuesta de busqueda.');

  const data = JSON.parse(match[1]);
  const results = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.videoRenderer && results.length < limit) {
      const v = node.videoRenderer;
      results.push({
        id: v.videoId,
        title: v.title?.runs?.map((r) => r.text).join('') ?? null,
        channel: v.ownerText?.runs?.[0]?.text ?? v.longBylineText?.runs?.[0]?.text ?? null,
        duration: v.lengthText?.simpleText ?? null,
        views: v.viewCountText?.simpleText ?? v.shortViewCountText?.simpleText ?? null,
        published: v.publishedTimeText?.simpleText ?? null,
        thumbnail: v.thumbnail?.thumbnails?.slice(-1)[0]?.url ?? null,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  };
  walk(data);
  return { query, total: results.length, videos: results };
}
