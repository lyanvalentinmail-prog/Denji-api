import { defineCategory } from '../core/registry.js';
import { ok } from '../core/respond.js';
import { optional, intParam, limit } from '../core/params.js';
import { randomPost, subredditPosts } from '../providers/reddit.js';
import { rule34Search, rule34Random } from '../providers/rule34.js';
import { upstream } from '../core/errors.js';
import { getJson } from '../core/http.js';

export const nsfw = defineCategory({
  id: 'nsfw',
  name: 'NSFW',
  path: '/nsfw',
  icon: '🔞',
  order: 60,
  nsfw: true,
  description: 'Contenido para adultos. Bloqueado por defecto: requiere activar el interruptor y confirmar la mayoria de edad.',
  note: 'Bloqueado por defecto · +18',
});

/** Un solo post, con varios proveedores en cascada. */
async function singlePost(subreddits) {
  const errors = [];
  for (const sub of subreddits) {
    try {
      return await randomPost(sub);
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw upstream('NSFW', 'Ningun proveedor devolvio contenido.', { tried: subreddits, errors: errors.slice(0, 2) });
}

async function multiPost(subreddits, limitCount) {
  const errors = [];
  for (const sub of subreddits) {
    try {
      const posts = await subredditPosts(sub, { limit: limitCount });
      if (posts.length) return { posts, sub };
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw upstream('NSFW', 'Ningun proveedor devolvio contenido.', { tried: subreddits, errors: errors.slice(0, 2) });
}

nsfw.get('/tetas', {
  name: 'Tetas',
  nsfw: true,
  description: 'Imagen aleatoria de la categoria tetas.',
  params: [{ name: 'amount', type: 'int', description: 'Resultados (1-25)', example: '5', default: '1' }],
  example: '/nsfw/tetas',
}, async (req, res) => {
  const amount = intParam(req, 'amount', { fallback: 1, min: 1, max: 25 });
  if (amount === 1) return ok(res, await singlePost(['boobs', 'GrabHerByTheTitties']));
  const { posts, sub } = await multiPost(['boobs'], amount);
  return ok(res, { total: posts.length, items: posts }, { provider: `r/${sub}` });
});

nsfw.get('/culos', {
  name: 'Culos',
  nsfw: true,
  description: 'Imagen aleatoria de la categoria culos.',
  params: [{ name: 'amount', type: 'int', description: 'Resultados (1-25)', example: '5', default: '1' }],
  example: '/nsfw/culos',
}, async (req, res) => {
  const amount = intParam(req, 'amount', { fallback: 1, min: 1, max: 25 });
  if (amount === 1) return ok(res, await singlePost(['ass', 'assinthong']));
  const { posts, sub } = await multiPost(['ass'], amount);
  return ok(res, { total: posts.length, items: posts }, { provider: `r/${sub}` });
});

nsfw.get('/anime18', {
  name: 'Anime +18',
  nsfw: true,
  description: 'Imagen o GIF de anime para adultos, con varios proveedores en cascada.',
  params: [{ name: 'amount', type: 'int', description: 'Resultados (1-25)', example: '5', default: '1' }],
  example: '/nsfw/anime18',
}, async (req, res) => {
  const amount = intParam(req, 'amount', { fallback: 1, min: 1, max: 25 });

  const providers = [
    {
      name: 'waifu.im',
      single: async () => {
        const json = await getJson('https://api.waifu.im/search?included_tags=neko&is_nsfw=true&many=true', { provider: 'waifu.im' });
        const image = json?.images?.[0];
        if (!image?.url) throw upstream('waifu.im', 'Sin imagenes.');
        return {
          url: image.url,
          source: image.source ?? null,
          width: image.width ?? null,
          height: image.height ?? null,
          signature: image.signature ?? null,
          provider: 'waifu.im',
        };
      },
    },
    {
      name: 'waifu.pics',
      single: async () => {
        const json = await getJson('https://api.waifu.pics/nsfw/neko', { provider: 'waifu.pics' });
        if (!json?.url) throw upstream('waifu.pics', 'Sin imagenes.');
        return { url: json.url, provider: 'waifu.pics' };
      },
    },
    {
      name: 'reddit',
      single: async () => {
        const post = await randomPost('hentai');
        return { ...post, provider: 'reddit.com/r/hentai' };
      },
    },
  ];

  const errors = [];
  for (const provider of providers) {
    try {
      const data = await provider.single();
      return ok(res, amount === 1 ? data : { total: 1, items: [data] });
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw upstream('NSFW', 'Ningun proveedor de anime +18 respondio.', { errors });
});

nsfw.get('/rule34', {
  name: 'Rule34',
  nsfw: true,
  description: 'Busca en Rule34. Con RULE34_USER_ID y RULE34_API_KEY usa la API oficial; sin claves usa la comunidad espejo de Reddit.',
  params: [
    { name: 'tags', type: 'text', description: 'Etiquetas separadas por espacio', example: 'hatsune_miku' },
    { name: 'limit', type: 'int', description: 'Resultados (1-100)', example: '20', default: '20' },
    { name: 'page', type: 'int', description: 'Pagina', example: '0', default: '0' },
  ],
  example: '/nsfw/rule34?tags=hatsune_miku&limit=10',
}, async (req, res) => {
  const tags = limit(optional(req, 'tags', '', ['q', 'tag']), 300);
  const count = intParam(req, 'limit', { fallback: 20, min: 1, max: 100 });
  const page = intParam(req, 'page', { fallback: 0, min: 0, max: 200 });
  return ok(res, await rule34Search({ tags, limit: count, page }));
});

nsfw.get('/rule34/random', {
  name: 'Rule34 Random',
  nsfw: true,
  description: 'Post aleatorio de Rule34.',
  params: [{ name: 'tags', type: 'text', description: 'Etiquetas opcionales', example: 'hatsune_miku' }],
  example: '/nsfw/rule34/random',
}, async (req, res) => {
  const tags = limit(optional(req, 'tags', '', ['q', 'tag']), 300);
  return ok(res, await rule34Random(tags));
});
