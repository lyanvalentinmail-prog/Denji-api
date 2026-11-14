import { getJson } from './http.js';
import { sharedCache } from './cache.js';
import { notFound, upstream } from './errors.js';

const API = 'https://pokeapi.co/api/v2';
const LANGS = ['es', 'en', 'ja', 'fr', 'de', 'it', 'ko', 'zh-Hans', 'ru'];

/** Tabla de efectividad de tipos (Gen VI+): atacante -> { defensor: multiplicador }. */
const CHART = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

/** PRNG determinista para que una batalla se pueda reproducir con la misma semilla. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Datos limpios de un Pokemon desde PokeAPI. */
export async function fetchPokemon(query, language = 'es') {
  const key = String(query).toLowerCase().replace(/\s+/g, '-');
  return sharedCache.wrap(`pokemon:${key}:${language}`, async () => {
    let raw;
    try {
      raw = await getJson(`${API}/pokemon/${encodeURIComponent(key)}`, { provider: 'PokeAPI' });
    } catch (err) {
      if (err.status === 502 && /HTTP 404/.test(err.message)) {
        throw notFound(`No existe el Pokemon "${query}".`);
      }
      throw err;
    }

    let species = null;
    try {
      species = await getJson(`${API}/pokemon-species/${raw.id}`, { provider: 'PokeAPI' });
    } catch {
      species = null; // la ficha funciona igual sin la especie
    }

    const lang = LANGS.includes(language) ? language : 'es';
    const localName = species?.names?.find((n) => n.language.name === lang)?.name ?? raw.name;
    const genus = species?.genera?.find((g) => g.language.name === lang)?.genus ?? null;
    const flavor = species?.flavor_text_entries?.find((f) => f.language.name === lang)?.flavor_text
      ?.replace(/[\n\f]/g, ' ') ?? null;

    return {
      id: raw.id,
      name: raw.name,
      localName,
      genus,
      description: flavor,
      types: raw.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
      height: raw.height / 10,
      weight: raw.weight / 10,
      baseExperience: raw.base_experience,
      abilities: raw.abilities.map((a) => ({ name: a.ability.name, hidden: a.is_hidden })),
      stats: raw.stats.reduce((acc, s) => ({ ...acc, [s.stat.name]: s.base_stat }), {}),
      sprites: {
        default: raw.sprites?.front_default ?? null,
        shiny: raw.sprites?.front_shiny ?? null,
        artwork: raw.sprites?.other?.['official-artwork']?.front_default ?? null,
        home: raw.sprites?.other?.home?.front_default ?? null,
      },
    };
  });
}

const statOf = (pokemon, name) => pokemon.stats[name] ?? 50;

function buildCombatant(pokemon) {
  const level = 50;
  const hp = Math.floor(((2 * statOf(pokemon, 'hp') + 31) * level) / 100) + level + 10;
  const type = pokemon.types[0] ?? 'normal';
  return {
    name: pokemon.localName || pokemon.name,
    types: pokemon.types,
    sprite: pokemon.sprites.artwork || pokemon.sprites.default,
    level,
    maxHp: hp,
    hp,
    attack: statOf(pokemon, 'attack'),
    defense: statOf(pokemon, 'defense'),
    specialAttack: statOf(pokemon, 'special-attack'),
    specialDefense: statOf(pokemon, 'special-defense'),
    speed: statOf(pokemon, 'speed'),
    move: { name: `${type.toUpperCase()} STRIKE`, type, power: 70, physical: statOf(pokemon, 'attack') >= statOf(pokemon, 'special-attack') },
  };
}

export function effectiveness(attackType, defenseTypes) {
  const row = CHART[attackType] ?? {};
  return defenseTypes.reduce((mult, t) => mult * (row[t] ?? 1), 1);
}

/**
 * Simula un combate por turnos entre dos Pokemon.
 * Usa la formula de daño de Gen III con STAB, efectividad de tipo y criticos.
 */
export function simulateBattle(a, b, seedText) {
  const seed = hashSeed(seedText ?? `${a.name}-vs-${b.name}-${Date.now()}`);
  const random = mulberry32(seed);

  const left = buildCombatant(a);
  const right = buildCombatant(b);
  const order = left.speed === right.speed ? (random() < 0.5 ? [left, right] : [right, left]) : left.speed > right.speed ? [left, right] : [right, left];
  const log = [];
  let turn = 0;

  while (left.hp > 0 && right.hp > 0 && turn < 200) {
    turn += 1;
    for (const attacker of order) {
      const defender = attacker === left ? right : left;
      if (defender.hp <= 0 || attacker.hp <= 0) continue;

      const eff = effectiveness(attacker.move.type, defender.types);
      const stab = attacker.types.includes(attacker.move.type) ? 1.5 : 1;
      const critical = random() < 0.0625 ? 1.5 : 1;
      const noise = 0.85 + random() * 0.15;
      const atk = attacker.move.physical ? attacker.attack : attacker.specialAttack;
      const def = attacker.move.physical ? defender.defense : defender.specialDefense;

      if (eff === 0) {
        log.push({ turn, attacker: attacker.name, defender: defender.name, move: attacker.move.name, damage: 0, note: 'No afecta...' });
        continue;
      }

      const base = ((2 * attacker.level) / 5 + 2) * attacker.move.power * (atk / Math.max(1, def)) / 50 + 2;
      const damage = Math.max(1, Math.floor(base * eff * stab * critical * noise));
      defender.hp = Math.max(0, defender.hp - damage);

      log.push({
        turn,
        attacker: attacker.name,
        defender: defender.name,
        move: attacker.move.name,
        type: attacker.move.type,
        damage,
        critical: critical > 1,
        effectiveness: eff,
        remainingHp: defender.hp,
      });
      if (defender.hp <= 0) break;
    }
  }

  const winner = left.hp > right.hp ? left : right;
  const loser = winner === left ? right : left;
  return {
    seed,
    rounds: turn,
    winner: { name: winner.name, remainingHp: winner.hp, maxHp: winner.maxHp, sprite: winner.sprite },
    loser: { name: loser.name, remainingHp: loser.hp, maxHp: loser.maxHp, sprite: loser.sprite },
    combatants: [
      { name: left.name, types: left.types, hp: left.hp, maxHp: left.maxHp, speed: left.speed, move: left.move },
      { name: right.name, types: right.types, hp: right.hp, maxHp: right.maxHp, speed: right.speed, move: right.move },
    ],
    log,
  };
}

export const SUPPORTED_LANGUAGES = LANGS;
void upstream;
