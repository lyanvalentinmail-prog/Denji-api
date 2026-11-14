import { getJson } from '../core/http.js';
import { upstream } from '../core/errors.js';

const HOSTS = ['https://www.reddit.com', 'https://old.reddit.com'];

function normalizePost(post) {
  const data = post?.data ?? post;
  if (!data) return null;

  let image = data.url_overridden_by_dest ?? data.url ?? null;
  const images = [];

  // Galeria de imagenes
  if (data.media_metadata && data.gallery_data) {
    for (const item of data.gallery_data.items ?? []) {
      const meta = data.media_metadata[item.media_id];
      if (meta?.status === 'valid' && meta.s?.u) images.push(meta.s.u.replace(/&amp;/g, '&'));
    }
  } else if (Array.isArray(data.preview?.images)) {
    for (const img of data.preview.images) {
      const src = img.source?.url?.replace(/&amp;/g, '&');
      if (src) images.push(src);
      for (const variant of img.variants?.gif?.versions ?? []) {
        if (variant.url) images.push(variant.url.replace(/&amp;/g, '&'));
      }
    }
  }

  if (!image && images.length) image = images[0];
  if (/v\.redd\.it/.test(image ?? '')) {
    image = data.preview?.reddit_video_preview?.fallback_url ?? data.secure_media?.reddit_video?.fallback_url ?? image;
  }

  return {
    id: data.id ?? null,
    title: data.title ?? null,
    author: data.author ?? null,
    subreddit: data.subreddit ?? null,
    url: image,
    images: images.length ? images : null,
    isVideo: Boolean(data.is_video),
    score: data.ups ?? data.score ?? null,
    comments: data.num_comments ?? null,
    nsfw: Boolean(data.over_18),
    permalink: data.permalink ? `https://www.reddit.com${data.permalink}` : null,
  };
}

async function redditJson(path) {
  let lastError;
  for (const host of HOSTS) {
    try {
      const json = await getJson(`${host}${path}`, {
        provider: 'Reddit',
        timeout: 15000,
        retries: 1,
        headers: { accept: 'application/json' },
      });
      return json;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? upstream('Reddit', 'No se pudo obtener el contenido.');
}

function pickPost(json) {
  if (Array.isArray(json)) return json[0]?.data?.children?.[0] ?? null;
  return json?.data?.children?.[0] ?? null;
}

/** Un post aleatorio de un subreddit. */
export async function randomPost(subreddit) {
  const json = await redditJson(`/r/${subreddit}/random.json?limit=1&raw_json=1`);
  const post = normalizePost(pickPost(json));
  if (!post?.url) throw upstream('Reddit', `r/${subreddit} no devolvio contenido util.`);
  return { ...post, source: `reddit.com/r/${subreddit}` };
}

/** Posts recientes/populares de un subreddit. */
export async function subredditPosts(subreddit, { limit = 10, sort = 'hot' } = {}) {
  const json = await redditJson(`/r/${subreddit}/${sort}.json?limit=${limit}&raw_json=1`);
  const posts = (json?.data?.children ?? [])
    .map(normalizePost)
    .filter((p) => p?.url && !p.isVideo)
    .slice(0, limit);
  if (!posts.length) throw upstream('Reddit', `r/${subreddit} no devolvio imagenes.`);
  return posts.map((p) => ({ ...p, source: `reddit.com/r/${subreddit}` }));
}
