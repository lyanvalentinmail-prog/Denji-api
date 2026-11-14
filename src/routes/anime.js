import { defineCategory } from '../core/registry.js';
import { getJson } from '../core/http.js';
import { sharedCache } from '../core/cache.js';
import { ok } from '../core/respond.js';
import { required, optional, intParam } from '../core/params.js';
import { invalidParam } from '../core/errors.js';
import { fetchPokemon, simulateBattle, SUPPORTED_LANGUAGES } from '../core/pokemon.js';

const NEKOS = 'https://nekos.best/api/v2';

/** Categorias de imagen estatica de nekos.best. */
const IMAGE_CATEGORIES = {
  waifu: { label: 'Waifu', tag: 'waifu' },
  neko: { label: 'Neko', tag: 'neko' },
  husbando: { label: 'Husbando', tag: 'husbando' },
  kitsune: { label: 'Kitsune', tag: 'kitsune' },
};

/** Reacciones GIF disponibles (nekos.best v2) con su etiqueta en español. */
export const REACTIONS = {
  angry: 'Enojado', baka: 'Baka', bite: 'Mordida', bleh: 'Bleh', blush: 'Sonrojado',
  bonk: 'Bonk', bored: 'Aburrido', blowkiss: 'Beso al aire', carry: 'Cargar', clap: 'Aplauso',
  confused: 'Confundido', cry: 'Llorando', cuddle: 'Abrazo tierno', dance: 'Bailando', facepalm: 'Facepalm',
  feed: 'Dar de comer', happy: 'Feliz', handshake: 'Apretón de manos', handhold: 'Tomar de la mano',
  highfive: 'Choca los cinco',
  hug: 'Abrazo', kabedon: 'Kabedon', kick: 'Patada', kiss: 'Beso', lappillow: 'Almohada de regazo',
  laugh: 'Riendo', lurk: 'Acechando', nod: 'Asentir', nom: 'Nom', nope: 'Nope', nya: 'Nya',
  pat: 'Caricia', peck: 'Piquito', poke: 'Poke', pout: 'Molesto', punch: 'Puñetazo', run: 'Correr',
  salute: 'Saludo militar', shake: 'Sacudir', shocked: 'Impactado', shoot: 'Disparar', shrug: 'Encogerse',
  sip: 'Sorbete', slap: 'Bofetada', sleep: 'Durmiendo', smile: 'Sonrisa', smug: 'Engreido',
  spin: 'Girar', stare: 'Mirada fija', tableflip: 'Tableflip', teehee: 'Teehee', think: 'Pensando',
  thumbsup: 'Pulgar arriba', tickle: 'Cosquillas', wag: 'Mover la cola', wave: 'Saludar', wink: 'Guiño',
  yawn: 'Bostezo', yeet: 'Yeet',
};

export const REACTION_LIST = Object.entries(REACTIONS).map(([slug, label]) => ({ slug, label }));

function nekosImage(kind) {
  return async (req, res) => {
    const amount = intParam(req, 'amount', { fallback: 1, min: 1, max: 20 });
    const json = await getJson(`${NEKOS}/${kind}${amount > 1 ? `?amount=${amount}` : ''}`, {
      provider: 'nekos.best',
    });
    const results = (json.results ?? []).map((item) => ({
      url: item.url,
      anime: item.anime_name ?? null,
      artist: item.artist_name ?? null,
      artistUrl: item.artist_href ?? null,
      source: item.source_url ?? null,
      width: item.dimensions?.width ?? null,
      height: item.dimensions?.height ?? null,
    }));
    if (!results.length) throw invalidParam('amount', 'nekos.best no devolvio resultados');
    return ok(res, amount === 1 ? results[0] : results, { provider: 'nekos.best' });
  };
}

export const anime = defineCategory({
  id: 'anime',
  name: 'Anime',
  path: '/anime',
  icon: '🌸',
  order: 20,
  description: 'Imagenes de anime, fichas de Pokemon y simulador de combates.',
});

anime.get('/waifu', {
  name: 'Waifu',
  description: 'Imagen aleatoria de una waifu.',
  params: [{ name: 'amount', type: 'int', description: 'Resultados (1-20)', example: '3' }],
  example: '/anime/waifu',
  source: 'nekos.best',
}, nekosImage('waifu'));

anime.get('/neko', {
  name: 'Neko',
  description: 'Imagen aleatoria de una chica gato (neko).',
  params: [{ name: 'amount', type: 'int', description: 'Resultados (1-20)', example: '3' }],
  example: '/anime/neko',
  source: 'nekos.best',
}, nekosImage('neko'));

anime.get('/husbando', {
  name: 'Husbando',
  description: 'Imagen aleatoria de un husbando.',
  params: [{ name: 'amount', type: 'int', description: 'Resultados (1-20)', example: '3' }],
  example: '/anime/husbando',
  source: 'nekos.best',
}, nekosImage('husbando'));

anime.get('/pokemon', {
  name: 'Pokemon',
  description: 'Ficha completa de un Pokemon: stats, tipos, sprites y descripcion.',
  params: [
    { name: 'query', type: 'text', required: true, description: 'Nombre o numero de la Pokédex', example: 'pikachu' },
    { name: 'language', type: 'text', description: SUPPORTED_LANGUAGES.join(' | '), example: 'es', default: 'es' },
  ],
  example: '/anime/pokemon?query=pikachu&language=es',
  source: 'PokeAPI',
}, async (req, res) => {
  const query = required(req, 'query', ['pokemon', 'name']);
  const language = optional(req, 'language', 'es');
  const data = await fetchPokemon(query, language);
  return ok(res, data, { provider: 'PokeAPI' });
});

anime.get('/pokemonbattle', {
  name: 'Pokemon Battle',
  description: 'Simula un combate por turnos entre dos Pokemon con la formula de daño de Gen III.',
  params: [
    { name: 'pokemon1', type: 'text', required: true, description: 'Primer combatiente', example: 'pikachu' },
    { name: 'pokemon2', type: 'text', required: true, description: 'Segundo combatiente', example: 'charizard' },
    { name: 'seed', type: 'text', description: 'Semilla para reproducir la misma batalla' },
  ],
  example: '/anime/pokemonbattle?pokemon1=pikachu&pokemon2=charizard',
  source: 'PokeAPI',
}, async (req, res) => {
  const name1 = required(req, 'pokemon1', ['a', 'p1']);
  const name2 = required(req, 'pokemon2', ['b', 'p2']);
  const seed = optional(req, 'seed');
  const language = optional(req, 'language', 'es');
  const [a, b] = await Promise.all([fetchPokemon(name1, language), fetchPokemon(name2, language)]);
  return ok(res, {
    versus: { a: a.localName, b: b.localName },
    ...simulateBattle(a, b, seed),
  }, { provider: 'PokeAPI' });
});

/* ------------------------------------------------------------------ */
/*  Subcarpeta: anime reactions                                        */
/* ------------------------------------------------------------------ */

export const reactions = defineCategory({
  id: 'anime-reactions',
  name: 'Anime Reactions',
  path: '/anime/reactions',
  parent: 'anime',
  icon: '🎭',
  order: 1,
  description: 'GIFs de reacciones de anime, listos para usar en bots de Discord o Telegram.',
});

reactions.get('/list', {
  name: 'Lista de reacciones',
  description: 'Devuelve todas las reacciones disponibles y su slug.',
  example: '/anime/reactions/list',
}, async (req, res) => ok(res, { total: REACTION_LIST.length, reactions: REACTION_LIST }));

for (const { slug, label } of REACTION_LIST) {
  reactions.get(`/${slug}`, {
    name: label,
    description: `GIF aleatorio de reaccion: ${label.toLowerCase()}.`,
    params: [{ name: 'amount', type: 'int', description: 'Resultados (1-20)', example: '2' }],
    example: `/anime/reactions/${slug}`,
    source: 'nekos.best',
  }, nekosImage(slug));
}

export const ANIME_IMAGE_CATEGORIES = IMAGE_CATEGORIES;
void sharedCache;
