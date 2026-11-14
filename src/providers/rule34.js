import { getJson, buildUrl } from '../core/http.js';
import { upstream } from '../core/errors.js';
import { subredditPosts, randomPost } from './reddit.js';

/**
 * Rule34.
 * La API oficial pidio autenticacion en 2025, asi que se usan las claves del entorno
 * cuando existen y, si no, se recurre a la comunidad espejo de Reddit.
 */
export async function rule34Search({ tags = '', limit = 20, page = 0 }) {
  const userId = process.env.RULE34_USER_ID;
  const apiKey = process.env.RULE34_API_KEY;

  if (userId && apiKey) {
    const url = buildUrl('https://api.rule34.xxx/index.php', {
      page: 'dapi',
      s: 'post',
      q: 'index',
      json: 1,
      limit: Math.min(limit, 100),
      pid: page,
      tags: tags || undefined,
      user_id: userId,
      api_key: apiKey,
    });
    const json = await getJson(url, { provider: 'Rule34', retries: 1 });
    const posts = (Array.isArray(json) ? json : []).map((p) => ({
      id: p.id,
      tags: String(p.tags ?? '').split(' ').filter(Boolean),
      rating: p.rating ?? null,
      score: p.score ?? null,
      width: p.width ?? null,
      height: p.height ?? null,
      image: p.file_url ?? null,
      thumbnail: p.preview_url ? `https:${p.preview_url}` : null,
      source: p.source ?? null,
      page: `https://rule34.xxx/index.php?page=post&s=view&id=${p.id}`,
    }));
    if (posts.length) return { query: tags, source: 'rule34.xxx', total: posts.length, posts };
  }

  // Sin credenciales: comunidad espejo de Reddit.
  const tag = String(tags).split(/\s+/).filter(Boolean)[0];
  const posts = tag
    ? await subredditPosts('rule34', { limit })
    : await subredditPosts('rule34', { limit });
  return {
    query: tags || null,
    source: 'reddit.com/r/rule34',
    note: 'Define RULE34_USER_ID y RULE34_API_KEY para usar la API oficial de rule34.xxx.',
    total: posts.length,
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      image: p.url,
      images: p.images,
      score: p.score,
      page: p.permalink,
    })),
  };
}

export async function rule34Random(tags = '') {
  const result = await rule34Search({ tags, limit: 1, page: 0 });
  const post = result.posts[0] ?? null;
  if (!post) {
    // Ultimo recurso: post aleatorio del subreddit.
    return { ...(await randomPost('rule34')), source: result.source };
  }
  if (!post.image) throw upstream('Rule34', 'No se obtuvo ninguna imagen.');
  return { ...post, source: result.source };
}
