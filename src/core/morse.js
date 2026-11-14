import { badRequest } from './errors.js';

/**
 * Codigo Morse internacional (ITU-R M.1677-1).
 * Incluye letras acentuadas y la ñ, utiles para texto en español.
 */
export const MORSE_TABLE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...',
  8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.',
  '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', $: '...-..-', '@': '.--.-.',
  Á: '.--.-', À: '.--.-', Ä: '.-.-', É: '..-..', È: '.-..-', Ê: '-..-.', Í: '..-..',
  Ï: '-..-.', Ó: '---.', Ö: '---.', Ñ: '--.--', Ü: '..--', Ç: '-.-..',
};

const REVERSE = Object.fromEntries(
  Object.entries(MORSE_TABLE).map(([char, code]) => [
    code,
    // Al decodificar se prefiere la forma ASCII cuando varias letras comparten codigo.
    char.length === 1 && char === char.normalize('NFD').replace(/[\u0300-\u036f]/g, '') ? char : code,
  ]),
);

// Mapa de decodificacion explicito: prioriza la letra base sin tilde.
const DECODE_MAP = {};
for (const [char, code] of Object.entries(MORSE_TABLE)) {
  if (!(code in DECODE_MAP)) DECODE_MAP[code] = char;
}
for (const code of Object.keys(MORSE_TABLE)) {
  const plain = code.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (plain !== code && MORSE_TABLE[plain]) DECODE_MAP[MORSE_TABLE[plain]] = plain;
}
void REVERSE;

export function encodeMorse(text) {
  return String(text)
    .toUpperCase()
    .split('')
    .map((char) => {
      if (char === ' ') return '/';
      const code = MORSE_TABLE[char];
      if (code) return code;
      const plain = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return MORSE_TABLE[plain] ?? '';
    })
    .filter((token) => token !== '')
    .join(' ');
}

export function decodeMorse(morse) {
  return String(morse)
    .trim()
    .split(/\s*\/\s*|\s{2,}/)
    .map((word) =>
      word
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((code) => DECODE_MAP[code] ?? '')
        .join(''),
    )
    .filter((word) => word !== '')
    .join(' ');
}

/**
 * Detecta la direccion y convierte.
 * Si el texto solo contiene puntos, rayas, barras y espacios -> se decodifica.
 */
export function convertMorse(text, mode = 'auto') {
  if (!text || !String(text).trim()) throw badRequest('El parametro "text" esta vacio.');
  const value = String(text);
  const looksLikeMorse = /^[\s.\-/]+$/.test(value.trim()) && /[.\-]/.test(value);

  let direction = mode;
  if (mode === 'auto') direction = looksLikeMorse ? 'decode' : 'encode';
  if (direction === 'decode') return { mode: 'decode', input: value, result: decodeMorse(value) };
  if (direction === 'encode') return { mode: 'encode', input: value, result: encodeMorse(value) };
  throw badRequest(`Modo no valido: "${mode}". Usa "encode", "decode" o "auto".`);
}
