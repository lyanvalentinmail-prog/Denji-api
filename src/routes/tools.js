import { defineCategory } from '../core/registry.js';
import { getJson, buildUrl } from '../core/http.js';
import { ok } from '../core/respond.js';
import { required, optional, limit } from '../core/params.js';
import { badRequest, invalidParam } from '../core/errors.js';
import { evaluate, SUPPORTED_FUNCTIONS, SUPPORTED_CONSTANTS } from '../core/calc.js';
import { convertMorse, MORSE_TABLE } from '../core/morse.js';

export const tools = defineCategory({
  id: 'herramientas',
  name: 'Herramientas',
  path: '/herramientas',
  icon: '🧰',
  order: 10,
  description: 'Calculadora, traductor, Morse y Emoji Mix de Google. Sin claves, sin registro.',
});

tools.get('/calculadora', {
  name: 'Calculadora',
  description: 'Evalua una expresion matematica de forma segura (sin eval). Soporta parentesis, potencias y funciones.',
  params: [
    { name: 'expr', type: 'text', required: true, description: 'Expresion matematica', example: '(2+3)*4^2' },
  ],
  example: '/herramientas/calculadora?expr=(2%2B3)*4%5E2',
  source: 'local',
}, async (req, res) => {
  const expr = required(req, 'expr', ['expression', 'q', 'calc']);
  return ok(res, {
    ...evaluate(expr),
    supported: { functions: SUPPORTED_FUNCTIONS, constants: SUPPORTED_CONSTANTS, operators: ['+', '-', '*', '/', '%', '^', '()'] },
  });
});

tools.get('/traductor', {
  name: 'Traductor',
  description: 'Traduce texto a cualquier idioma detectando el idioma de origen automaticamente.',
  params: [
    { name: 'text', type: 'text', required: true, description: 'Texto a traducir', example: 'Hola, bienvenido a Denji API' },
    { name: 'to', type: 'text', description: 'Idioma destino (ISO 639-1)', example: 'en', default: 'en' },
    { name: 'from', type: 'text', description: 'Idioma origen', example: 'auto', default: 'auto' },
  ],
  example: '/herramientas/traductor?text=Hola,%20bienvenido%20a%20Denji%20API&to=en',
  source: 'Google Translate',
}, async (req, res) => {
  const text = limit(required(req, 'text', ['q']), 4500);
  const to = optional(req, 'to', 'en', ['target', 'tl', 'language', 'lang']);
  const from = optional(req, 'from', 'auto', ['source', 'sl']);

  const url = buildUrl('https://translate.googleapis.com/translate_a/single', {
    client: 'gtx',
    sl: from,
    tl: to,
    dt: 't',
    dj: 1,
    q: text,
  });
  const json = await getJson(url, { provider: 'Google Translate' });

  const sentences = Array.isArray(json?.sentences) ? json.sentences : [];
  const translated = sentences.map((s) => s?.trans ?? '').join('');
  if (!translated) throw badRequest('No se pudo traducir el texto proporcionado.');

  return ok(res, {
    from: json.src ?? from,
    to,
    original: text,
    translated,
  }, { provider: 'Google Translate' });
});

tools.get('/morse', {
  name: 'Morse',
  description: 'Convierte texto a codigo Morse y viceversa. Detecta la direccion automaticamente.',
  params: [
    { name: 'text', type: 'text', required: true, description: 'Texto o codigo Morse', example: 'Hola Denji' },
    { name: 'mode', type: 'text', description: 'encode | decode | auto', example: 'auto', default: 'auto', enum: ['encode', 'decode', 'auto'] },
  ],
  example: '/herramientas/morse?text=Hola%20Denji',
  source: 'local',
}, async (req, res) => {
  const text = limit(required(req, 'text', ['q']), 2000);
  const mode = optional(req, 'mode', 'auto');
  const result = convertMorse(text, mode);
  return ok(res, { ...result, alphabet: Object.keys(MORSE_TABLE).length });
});

tools.get('/mixed', {
  name: 'Mixed (Emoji Mix)',
  description: 'Mezcla dos emojis usando Google Emoji Kitchen y devuelve el PNG resultante.',
  params: [
    { name: 'emoji1', type: 'text', required: true, description: 'Primer emoji', example: '😎' },
    { name: 'emoji2', type: 'text', required: true, description: 'Segundo emoji', example: '🔥' },
  ],
  example: '/herramientas/mixed?emoji1=%F0%9F%98%8E&emoji2=%F0%9F%94%A5',
  source: 'Google Emoji Kitchen',
}, async (req, res) => {
  const emoji1 = required(req, 'emoji1', ['a', 'e1']);
  const emoji2 = required(req, 'emoji2', ['b', 'e2']);

  const getEmojiMixUrl = (await import('emoji-mixer')).default;
  const { checkSupported, toUnicode } = await import('emoji-mixer');

  const url = getEmojiMixUrl(emoji1, emoji2);
  if (!url) {
    const left = toUnicode(emoji1);
    const right = toUnicode(emoji2);
    if (!left) throw invalidParam('emoji1', 'no es un emoji compatible con Emoji Kitchen');
    if (!right) throw invalidParam('emoji2', 'no es un emoji compatible con Emoji Kitchen');
    const compatible = (checkSupported(right) ?? [])
      .map((combo) => combo.rightEmoji)
      .filter(Boolean);
    throw invalidParam('emoji1', `Google no tiene mezcla para esa combinacion (${compatible.length} combinaciones disponibles para ${emoji2})`);
  }

  return ok(res, {
    emoji1,
    emoji2,
    url,
    direct: url,
  }, { provider: 'Google Emoji Kitchen' });
});
