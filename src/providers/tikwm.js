import { buildUrl, getJson } from '../core/http.js';
import { upstream } from '../core/errors.js';

const BASE = 'https://www.tikwm.com/api';

/**
 * TikTok via tikwm (sin marca de agua).
 * @param {URL} url
 * @param {{hd?: boolean}} options
 */
export async function tiktokInfo(url, { hd = false } = {}) {
  const json = await getJson(buildUrl(`${BASE}/`, { url: url.toString(), hd: hd ? 1 : 0 }), {
    provider: 'tikwm',
    retries: 1,
  });
  if (json.code !== 0 || !json.data) {
    throw upstream('tikwm', json.msg || 'No se pudo resolver el enlace de TikTok.', { code: json.code });
  }
  const d = json.data;
  const author = d.author ?? {};
  return {
    id: d.id ?? null,
    title: d.origin_title || d.title || null,
    description: d.title || null,
    duration: d.duration ?? null,
    region: d.region ?? null,
    createdAt: d.create_time ? new Date(d.create_time * 1000).toISOString() : null,
    author: {
      id: author.id ?? null,
      username: author.unique_id ?? null,
      nickname: author.nickname ?? null,
    },
    stats: {
      plays: d.play_count ?? null,
      likes: d.digg_count ?? null,
      comments: d.comment_count ?? null,
      shares: d.share_count ?? null,
      downloads: d.download_count ?? null,
    },
    cover: d.origin_cover || d.cover || null,
    music: d.music_info
      ? { title: d.music_info.title, author: d.music_info.author, url: d.music_info.play }
      : d.music
        ? { url: d.music }
        : null,
    video: {
      noWatermark: absolute(d.play),
      hd: d.hdplay ? absolute(d.hdplay) : null,
      watermark: d.wmplay ? absolute(d.wmplay) : null,
      size: d.hd_size ?? d.size ?? null,
    },
    images: Array.isArray(d.images) ? d.images.map(absolute) : null,
    source: 'tikwm.com',
  };
}

/** Busqueda de videos en TikTok. */
export async function tiktokSearch(query, { count = 12, cursor = 0 } = {}) {
  const json = await getJson(buildUrl(`${BASE}/feed/search`, { keywords: query, count, cursor }), {
    provider: 'tikwm',
  });
  if (json.code !== 0) throw upstream('tikwm', json.msg || 'Busqueda fallida.', { code: json.code });
  const videos = (json.data?.videos ?? []).map((v) => ({
    id: v.video_id ?? v.id,
    title: v.title,
    duration: v.duration,
    author: { username: v.author?.unique_id, nickname: v.author?.nickname },
    plays: v.play_count,
    likes: v.digg_count,
    comments: v.comment_count,
    cover: v.origin_cover || v.cover,
    video: { noWatermark: absolute(v.play), hd: v.hdplay ? absolute(v.hdplay) : null },
    url: `https://www.tiktok.com/@${v.author?.unique_id}/video/${v.video_id ?? v.id}`,
  }));
  return {
    query,
    total: videos.length,
    hasMore: Boolean(json.data?.hasMore),
    cursor: json.data?.cursor ?? cursor,
    videos,
  };
}

function absolute(href) {
  if (!href) return null;
  try {
    return new URL(href).toString();
  } catch {
    return new URL(href, 'https://www.tikwm.com').toString();
  }
}

/** Extrae el id de un video de TikTok. */
export function tiktokId(url) {
  const match = /(?:video|photo)\/(\d+)/.exec(url.pathname + url.search) || /(\d{15,})/.exec(url.pathname);
  return match ? match[1] : null;
}
