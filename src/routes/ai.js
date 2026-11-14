import { defineCategory } from '../core/registry.js';
import { postJson, request } from '../core/http.js';
import { ok } from '../core/respond.js';
import { required, optional, intParam, limit } from '../core/params.js';
import { missingKey, upstream } from '../core/errors.js';

export const ai = defineCategory({
  id: 'ai',
  name: 'AI',
  path: '/ai',
  icon: '🤖',
  order: 50,
  description: 'ChatGPT, Gemini, DeepSeek, Stability e Imagen. Requieren sus claves en las variables de entorno.',
  note: 'Requiere API keys en .env',
});

/** Lee una clave obligatoria del entorno. */
function key(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  throw missingKey(names.join(' o '), 'este endpoint de IA');
}

function chatParams(meta = {}) {
  return [
    { name: 'prompt', type: 'text', required: true, description: 'Mensaje o instruccion', example: 'Explica que es una API REST' },
    { name: 'system', type: 'text', description: 'Mensaje de sistema opcional' },
    { name: 'model', type: 'text', description: `Modelo (${meta.defaultModel})`, example: meta.defaultModel, default: meta.defaultModel },
    { name: 'temperature', type: 'float', description: '0 a 2', example: '0.7', default: '0.7' },
    { name: 'max_tokens', type: 'int', description: 'Limite de tokens', example: '512', default: '512' },
  ];
}

function readChat(req) {
  return {
    prompt: limit(required(req, 'prompt', ['q', 'text', 'message']), 8000),
    system: optional(req, 'system', null),
    temperature: Number(optional(req, 'temperature', '0.7')),
    maxTokens: intParam(req, 'max_tokens', { fallback: 512, min: 1, max: 8000 }),
  };
}

/* ------------------------------- ChatGPT ---------------------------- */
ai.any('/chatgpt', {
  name: 'ChatGPT',
  description: 'Genera texto con OpenAI ChatGPT. Requiere OPENAI_API_KEY.',
  params: chatParams({ defaultModel: 'gpt-4o-mini' }),
  example: '/ai/chatgpt?prompt=Explica%20que%20es%20una%20API%20REST',
}, async (req, res) => {
  const apiKey = key('OPENAI_API_KEY');
  const { prompt, system, temperature, maxTokens } = readChat(req);
  const model = optional(req, 'model', 'gpt-4o-mini');

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const json = await postJson('https://api.openai.com/v1/chat/completions', {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  }, { headers: { authorization: `Bearer ${apiKey}` }, provider: 'OpenAI', timeout: 60000 });

  const choice = json?.choices?.[0];
  return ok(res, {
    model: json?.model ?? model,
    text: choice?.message?.content?.trim() ?? null,
    finishReason: choice?.finish_reason ?? null,
    usage: json?.usage ?? null,
  }, { provider: 'openai' });
});

/* ------------------------------- Gemini ----------------------------- */
ai.any('/gemini', {
  name: 'Gemini',
  description: 'Genera texto con Google Gemini. Requiere GEMINI_API_KEY (o GOOGLE_API_KEY).',
  params: chatParams({ defaultModel: 'gemini-2.0-flash' }),
  example: '/ai/gemini?prompt=Escribe%20un%20haiku%20sobre%20el%20mar',
}, async (req, res) => {
  const apiKey = key('GEMINI_API_KEY', 'GOOGLE_API_KEY');
  const { prompt, system, temperature, maxTokens } = readChat(req);
  const model = optional(req, 'model', 'gemini-2.0-flash');

  const json = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    },
    { provider: 'Gemini', timeout: 60000 },
  );

  const candidate = json?.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  return ok(res, {
    model,
    text: text || null,
    finishReason: candidate?.finishReason ?? null,
    usage: json?.usageMetadata ?? null,
  }, { provider: 'gemini' });
});

/* ------------------------------- DeepSeek --------------------------- */
ai.any('/deepseek', {
  name: 'DeepSeek',
  description: 'Genera texto con DeepSeek. Requiere DEEPSEEK_API_KEY.',
  params: chatParams({ defaultModel: 'deepseek-chat' }),
  example: '/ai/deepseek?prompt=Resume%20la%20teoria%20de%20la%20relatividad',
}, async (req, res) => {
  const apiKey = key('DEEPSEEK_API_KEY');
  const { prompt, system, temperature, maxTokens } = readChat(req);
  const model = optional(req, 'model', 'deepseek-chat');

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const json = await postJson('https://api.deepseek.com/chat/completions', {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  }, { headers: { authorization: `Bearer ${apiKey}` }, provider: 'DeepSeek', timeout: 60000 });

  const choice = json?.choices?.[0];
  return ok(res, {
    model: json?.model ?? model,
    text: choice?.message?.content?.trim() ?? null,
    finishReason: choice?.finish_reason ?? null,
    usage: json?.usage ?? null,
  }, { provider: 'deepseek' });
});

/* ------------------------------- Stability -------------------------- */
ai.any('/stability', {
  name: 'Stability',
  description: 'Genera imagenes con Stability AI (SD3). Requiere STABILITY_API_KEY. Devuelve la imagen en base64 y data URL.',
  params: [
    { name: 'prompt', type: 'text', required: true, description: 'Descripcion de la imagen', example: 'a cyberpunk cat, neon lights' },
    { name: 'model', type: 'text', description: 'sd3 | sd3.5-large | core', example: 'sd3', default: 'sd3' },
    { name: 'aspect_ratio', type: 'text', description: '1:1, 16:9, 9:16, 4:3, 3:4', example: '1:1', default: '1:1' },
    { name: 'negative_prompt', type: 'text', description: 'Lo que no debe aparecer' },
    { name: 'format', type: 'text', description: 'png | jpeg | webp', example: 'png', default: 'png' },
  ],
  example: '/ai/stability?prompt=a%20cyberpunk%20cat',
}, async (req, res) => {
  const apiKey = key('STABILITY_API_KEY');
  const prompt = limit(required(req, 'prompt', ['q']), 2000);
  const model = optional(req, 'model', 'sd3');
  const format = optional(req, 'format', 'png');
  const aspect = optional(req, 'aspect_ratio', '1:1', ['aspect']);
  const negative = optional(req, 'negative_prompt');

  const body = new FormData();
  body.set('prompt', prompt);
  body.set('output_format', format);
  body.set('model', model);
  body.set('aspect_ratio', aspect);
  if (negative) body.set('negative_prompt', negative);

  const response = await request('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, accept: 'image/*' },
    body,
    provider: 'Stability',
    timeout: 90000,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw upstream('Stability', buffer.toString('utf8').slice(0, 300) || `HTTP ${response.status}`, {
      status: response.status,
    });
  }
  const base64 = buffer.toString('base64');
  const mime = response.headers.get('content-type') || `image/${format === 'jpg' ? 'jpeg' : format}`;

  return ok(res, {
    model,
    prompt,
    format,
    mimeType: mime,
    bytes: buffer.length,
    base64,
    dataUrl: `data:${mime};base64,${base64}`,
  }, { provider: 'stability' });
});

/* ------------------------------- Imagen ----------------------------- */
ai.any('/imagen', {
  name: 'Imagen',
  description: 'Genera imagenes con Google Imagen 3. Requiere GEMINI_API_KEY (o GOOGLE_API_KEY / IMAGEN_API_KEY).',
  params: [
    { name: 'prompt', type: 'text', required: true, description: 'Descripcion de la imagen', example: 'a watercolor fox in a forest' },
    { name: 'model', type: 'text', description: 'Modelo de Imagen', example: 'imagen-3.0-generate-002', default: 'imagen-3.0-generate-002' },
    { name: 'aspect_ratio', type: 'text', description: '1:1, 16:9, 9:16, 4:3, 3:4', example: '1:1', default: '1:1' },
    { name: 'count', type: 'int', description: 'Imagenes a generar (1-4)', example: '1', default: '1' },
  ],
  example: '/ai/imagen?prompt=a%20watercolor%20fox%20in%20a%20forest',
}, async (req, res) => {
  const apiKey = key('IMAGEN_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY');
  const prompt = limit(required(req, 'prompt', ['q']), 2000);
  const model = optional(req, 'model', 'imagen-3.0-generate-002');
  const aspect = optional(req, 'aspect_ratio', '1:1', ['aspect']);
  const count = intParam(req, 'count', { fallback: 1, min: 1, max: 4, aliases: ['n', 'samples'] });

  const json = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(apiKey)}`,
    {
      instances: [{ prompt }],
      parameters: { sampleCount: count, aspectRatio: aspect },
    },
    { provider: 'Imagen', timeout: 90000 },
  );

  const predictions = json?.predictions ?? [];
  if (!predictions.length) {
    throw upstream('Imagen', 'No se genero ninguna imagen.', {
      reason: json?.promptFeedback?.blockReason ?? 'desconocido',
    });
  }

  const images = predictions
    .filter((p) => p?.bytesBase64Encoded)
    .map((p) => ({
      mimeType: p.mimeType || 'image/png',
      bytes: Buffer.byteLength(p.bytesBase64Encoded, 'base64'),
      base64: p.bytesBase64Encoded,
      dataUrl: `data:${p.mimeType || 'image/png'};base64,${p.bytesBase64Encoded}`,
    }));

  return ok(res, {
    model,
    prompt,
    total: images.length,
    images,
    image: images[0] ?? null,
  }, { provider: 'imagen' });
});
