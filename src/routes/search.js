import { defineCategory } from '../core/registry.js';
import { getJson, getText, buildUrl } from '../core/http.js';
import { ok } from '../core/respond.js';
import { required, optional, intParam } from '../core/params.js';
import { upstream, missingKey } from '../core/errors.js';
import * as cheerio from 'cheerio';
import { tiktokSearch } from '../providers/tikwm.js';
import { youtubeSearch } from '../providers/youtube.js';
import { pinterestSearch } from '../providers/pinterest.js';

export const search = defineCategory({
  id: 'busquedas',
  name: 'Búsquedas',
  path: '/busquedas',
  icon: '🔎',
  order: 40,
  description: 'Busca en TikTok, YouTube, Stickerly, Wikipedia, Play Store, Spotify, Pinterest, Google y wallpapers.',
});

/* ------------------------------ TikTok ------------------------------ */
search.get('/tiktok', {
  name: 'TikTok',
  description: 'Busca videos en TikTok y devuelve enlaces de descarga sin marca de agua.',
  params: [
    { name: 'query', type: 'text', required: true, example: 'anime edit' },
    { name: 'limit', type: 'int', description: 'Resultados (1-30)', example: '10', default: '12' },
  ],
  example: '/busquedas/tiktok?query=anime%20edit',
}, async (req, res) => {
  const query = required(req, 'query', ['q', 'keywords']);
  const limit = intParam(req, 'limit', { fallback: 12, min: 1, max: 30, aliases: ['count'] });
  return ok(res, await tiktokSearch(query, { count: limit }));
});

/* ------------------------------ YouTube ----------------------------- */
search.get('/youtube', {
  name: 'YouTube',
  description: 'Busca videos en YouTube con titulo, canal, duracion y miniatura.',
  params: [
    { name: 'query', type: 'text', required: true, example: 'lofi hip hop' },
    { name: 'limit', type: 'int', description: 'Resultados (1-30)', example: '10', default: '15' },
  ],
  example: '/busquedas/youtube?query=lofi%20hip%20hop',
}, async (req, res) => {
  const query = required(req, 'query', ['q']);
  const limit = intParam(req, 'limit', { fallback: 15, min: 1, max: 30 });
  return ok(res, await youtubeSearch(query, { limit }));
});

/* ------------------------------ Stickerly --------------------------- */
search.get('/stickerly', {
  name: 'Stickerly',
  description: 'Busca packs y stickers de WhatsApp en Stickerly.',
  params: [
    { name: 'query', type: 'text', required: true, example: 'anime' },
    { name: 'limit', type: 'int', description: 'Resultados (1-30)', example: '10', default: '15' },
  ],
  example: '/busquedas/stickerly?query=anime',
}, async (req, res) => {
  const query = required(req, 'query', ['q']);
  const limit = intParam(req, 'limit', { fallback: 15, min: 1, max: 30 });

  const target = buildUrl('https://www.stickerly.com/search/stickers', { query, page: 1 });
  const html = await getText(target, { provider: 'Stickerly', retries: 1 });

  // Stickerly sirve los datos embebidos como JSON dentro del HTML.
  const embedded = /window\.__INITIAL_STATE__\s*=\s*(\{.*?\});?\s*<\/script>/s.exec(html)
    || /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s.exec(html);

  const packs = [];
  if (embedded) {
    try {
      const json = JSON.parse(embedded[1]);
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.title && (node.stickerCount || node.stickers || node.thumbnailUrl)) {
          packs.push({
            title: node.title ?? null,
            author: node.authorName ?? node.author ?? null,
            stickers: node.stickerCount ?? (Array.isArray(node.stickers) ? node.stickers.length : null),
            thumbnail: node.thumbnailUrl ?? node.thumbnail ?? null,
            url: node.schemeUrl ?? node.link ?? (node.id ? `https://www.stickerly.com/pack/${node.id}` : null),
          });
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(walk);
          else if (value && typeof value === 'object') walk(value);
        }
      };
      walk(json);
    } catch {
      /* si el JSON cambia de forma, caemos al parseo HTML */
    }
  }

  if (!packs.length) {
    const $ = cheerio.load(html);
    $('a[href*="/pack/"], li.pack-item, div[class*="pack"]').each((_, el) => {
      if (packs.length >= limit) return;
      const link = $(el).attr('href') || $(el).find('a').attr('href');
      const title = $(el).find('p, span, .title').first().text().trim() || $(el).text().trim().slice(0, 80);
      if (link && title) {
        packs.push({
          title,
          author: null,
          stickers: null,
          thumbnail: $(el).find('img').attr('src') ?? null,
          url: link.startsWith('http') ? link : `https://www.stickerly.com${link}`,
        });
      }
    });
  }

  const unique = [];
  const seen = new Set();
  for (const pack of packs) {
    const key = pack.url || pack.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(pack);
    if (unique.length >= limit) break;
  }

  if (!unique.length) {
    throw upstream('Stickerly', 'No se encontraron resultados o cambio el formato de la pagina.', { query });
  }
  return ok(res, { query, total: unique.length, packs: unique });
});

/* ------------------------------ Wikipedia --------------------------- */
search.get('/wikipedia', {
  name: 'Wikipedia',
  description: 'Busca articulos en Wikipedia con extracto e imagen.',
  params: [
    { name: 'query', type: 'text', required: true, example: 'Chainsaw Man' },
    { name: 'language', type: 'text', description: 'Codigo de idioma', example: 'es', default: 'es' },
    { name: 'limit', type: 'int', description: 'Resultados (1-20)', example: '5', default: '5' },
  ],
  example: '/busquedas/wikipedia?query=Chainsaw%20Man&language=es',
}, async (req, res) => {
  const query = required(req, 'query', ['q']);
  const language = optional(req, 'language', 'es', ['lang']);
  const limit = intParam(req, 'limit', { fallback: 5, min: 1, max: 20 });

  const url = buildUrl(`https://${language}.wikipedia.org/w/api.php`, {
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: limit,
    prop: 'extracts|pageimages|info',
    exintro: 1,
    explaintext: 1,
    piprop: 'original|thumbnail',
    inprop: 'url',
    format: 'json',
    origin: '*',
  });
  const json = await getJson(url, { provider: 'Wikipedia' });
  const pages = Object.values(json?.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (!pages.length) throw upstream('Wikipedia', `Sin resultados para "${query}".`, { query });

  return ok(res, {
    query,
    language,
    total: pages.length,
    results: pages.map((p) => ({
      title: p.title,
      extract: p.extract ?? null,
      thumbnail: p.thumbnail?.source ?? null,
      image: p.original?.source ?? null,
      url: p.fullurl ?? `https://${language}.wikipedia.org/?curid=${p.pageid}`,
    })),
  });
});

/* ------------------------------ Play Store -------------------------- */
search.get('/playstore', {
  name: 'Play Store',
  description: 'Busca aplicaciones y juegos en Google Play Store.',
  params: [
    { name: 'query', type: 'text', required: true, example: 'spotify' },
    { name: 'limit', type: 'int', description: 'Resultados (1-30)', example: '10', default: '15' },
  ],
  example: '/busquedas/playstore?query=spotify',
}, async (req, res) => {
  const query = required(req, 'query', ['q']);
  const limit = intParam(req, 'limit', { fallback: 15, min: 1, max: 30 });
  const language = optional(req, 'language', 'es', ['lang']);

  const target = buildUrl('https://play.google.com/store/search', { q: query, c: 'apps', hl: language, gl: 'US' });
  const html = await getText(target, { provider: 'Google Play' });
  const $ = cheerio.load(html);

  const apps = [];
  const seen = new Set();
  $('a[href*="/store/apps/details?id="]').each((_, el) => {
    if (apps.length >= limit) return;
    const href = $(el).attr('href') || '';
    const id = /id=([^&]+)/.exec(href)?.[1];
    if (!id || seen.has(id)) return;
    seen.add(id);
    const title = $(el).find('div').first().text().trim() || $(el).attr('aria-label') || null;
    const img = $(el).find('img').attr('src') ?? null;
    if (!title && !img) return;
    apps.push({
      id,
      title,
      icon: img,
      url: `https://play.google.com/store/apps/details?id=${id}&hl=${language}`,
    });
  });

  if (!apps.length) {
    throw upstream('Google Play', 'No se encontraron resultados o cambio el formato de la pagina.', { query });
  }
  return ok(res, { query, total: apps.length, apps });
});

/* ------------------------------ Spotify ----------------------------- */
search.get('/spotify', {
  name: 'Spotify',
  description: 'Busca en Spotify. Con SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET usa la API oficial; sin claves usa Deezer como alternativa y lo indica en "source".',
  params: [
    { name: 'query', type: 'text', required: true, example: 'bad bunny' },
    { name: 'type', type: 'text', description: 'track | album | artist | playlist', example: 'track', default: 'track' },
    { name: 'limit', type: 'int', description: 'Resultados (1-30)', example: '10', default: '10' },
  ],
  example: '/busquedas/spotify?query=bad%20bunny&type=track',
}, async (req, res) => {
  const query = required(req, 'query', ['q']);
  const type = optional(req, 'type', 'track');
  const limit = intParam(req, 'limit', { fallback: 10, min: 1, max: 30 });
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (clientId && clientSecret) {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const token = await getJson('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      provider: 'Spotify',
    });
    const json = await getJson(
      buildUrl('https://api.spotify.com/v1/search', { q: query, type, limit }),
      { headers: { authorization: `Bearer ${token.access_token}` }, provider: 'Spotify' },
    );
    const key = `${type}s`;
    return ok(res, {
      query, type, source: 'spotify',
      total: json[key]?.items?.length ?? 0,
      results: (json[key]?.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        artist: item.artists?.map((a) => a.name).join(', ') ?? item.artists?.[0]?.name ?? null,
        album: item.album?.name ?? null,
        image: item.album?.images?.[0]?.url ?? item.images?.[0]?.url ?? null,
        url: item.external_urls?.spotify ?? null,
        preview: item.preview_url ?? null,
      })),
    });
  }

  // Sin credenciales: Deezer expone la misma informacion sin clave.
  const json = await getJson(buildUrl('https://api.deezer.com/search', { q: query, limit }), { provider: 'Deezer' });
  const tracks = json?.data ?? [];
  if (!tracks.length) throw upstream('Deezer', `Sin resultados para "${query}".`, { query });
  return ok(res, {
    query,
    type,
    source: 'deezer',
    note: 'Define SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET para usar la API oficial de Spotify.',
    total: tracks.length,
    results: tracks.map((t) => ({
      id: t.id,
      name: t.title,
      type: 'track',
      artist: t.artist?.name ?? null,
      album: t.album?.title ?? null,
      image: t.album?.cover_xl ?? null,
      url: t.link ?? null,
      preview: t.preview ?? null,
      duration: t.duration ?? null,
    })),
  });
});

/* ------------------------------ Pinterest --------------------------- */
search.get('/pinterest', {
  name: 'Pinterest',
  description: 'Busca pines e imagenes en Pinterest.',
  params: [
    { name: 'query', type: 'text', required: true, example: 'aesthetic wallpaper' },
    { name: 'limit', type: 'int', description: 'Resultados (1-50)', example: '20', default: '20' },
  ],
  example: '/busquedas/pinterest?query=aesthetic%20wallpaper',
}, async (req, res) => {
  const query = required(req, 'query', ['q']);
  const limit = intParam(req, 'limit', { fallback: 20, min: 1, max: 50 });
  return ok(res, await pinterestSearch(query, { limit }));
});

/* ------------------------------ Google ------------------------------ */
search.get('/google', {
  name: 'Google',
  description: 'Busca en Google. Si Google bloquea la peticion, se usa DuckDuckGo y se indica en "source".',
  params: [
    { name: 'query', type: 'text', required: true, example: 'denji api' },
    { name: 'limit', type: 'int', description: 'Resultados (1-30)', example: '10', default: '10' },
  ],
  example: '/busquedas/google?query=denji%20api',
}, async (req, res) => {
  const query = required(req, 'query', ['q']);
  const limit = intParam(req, 'limit', { fallback: 10, min: 1, max: 30 });
  const language = optional(req, 'language', 'es', ['lang']);

  try {
    const target = buildUrl('https://www.google.com/search', { q: query, num: limit, hl: language, gl: 'US' });
    const html = await getText(target, { provider: 'Google' });
    const $ = cheerio.load(html);
    const results = [];

    $('div.g, div[data-hveid] div.tF2Cxc').each((_, el) => {
      if (results.length >= limit) return;
      const link = $(el).find('a[href^="http"]').first().attr('href');
      const title = $(el).find('h3').first().text().trim();
      if (!link || !title || /google\./.test(link)) return;
      results.push({
        title,
        url: link,
        snippet: $(el).find('div[data-sncf], .VwiC3b, span.aCOpRe').first().text().trim() || null,
      });
    });

    if (results.length) return ok(res, { query, source: 'google', total: results.length, results });
    throw upstream('Google', 'La respuesta no contenia resultados parseables.');
  } catch {
    const fallback = await duckduckgo(query, limit);
    return ok(res, {
      query,
      source: 'duckduckgo',
      note: 'Google bloqueo la peticion desde este servidor; se uso DuckDuckGo.',
      ...fallback,
    });
  }
});

async function duckduckgo(query, limit) {
  const html = await getText(buildUrl('https://html.duckduckgo.com/html/', { q: query }), { provider: 'DuckDuckGo' });
  const $ = cheerio.load(html);
  const results = [];
  $('.result, .web-result').each((_, el) => {
    if (results.length >= limit) return;
    const title = $(el).find('.result__a').text().trim();
    let href = $(el).find('.result__a').attr('href') || '';
    const real = /uddg=([^&]+)/.exec(href)?.[1];
    if (real) href = decodeURIComponent(real);
    if (!title || !href) return;
    results.push({ title, url: href, snippet: $(el).find('.result__snippet').text().trim() || null });
  });
  if (!results.length) throw upstream('DuckDuckGo', 'Tampoco se obtuvieron resultados.', { query });
  return { total: results.length, results };
}

/* ------------------------------ Wallpaper --------------------------- */
search.get('/wallpaper', {
  name: 'Wallpaper',
  description: 'Busca fondos de pantalla en alta resolucion en Wallhaven.',
  params: [
    { name: 'query', type: 'text', required: true, example: 'anime night' },
    { name: 'limit', type: 'int', description: 'Resultados (1-50)', example: '12', default: '12' },
    { name: 'purity', type: 'text', description: '100 = sfw, 110 = sfw+sketchy', example: '100', default: '100' },
  ],
  example: '/busquedas/wallpaper?query=anime%20night',
}, async (req, res) => {
  const query = required(req, 'query', ['q']);
  const limit = intParam(req, 'limit', { fallback: 12, min: 1, max: 50 });
  const purity = optional(req, 'purity', '100');

  const json = await getJson(buildUrl('https://wallhaven.cc/api/v1/search', {
    q: query,
    purity,
    atleast: '1280x720',
    sorting: 'relevance',
  }), { provider: 'Wallhaven' });

  const items = (json?.data ?? []).slice(0, limit).map((w) => ({
    id: w.id,
    url: w.url,
    image: w.path,
    thumbnail: w.thumbs?.large ?? null,
    resolution: w.resolution,
    ratio: w.ratio,
    size: w.file_size,
    type: w.file_type,
    views: w.views,
    favorites: w.favorites,
    tags: (w.tags ?? []).map((t) => t.name),
  }));

  if (!items.length) throw upstream('Wallhaven', `Sin resultados para "${query}".`, { query });
  return ok(res, { query, total: items.length, wallpapers: items });
});

void missingKey;
