import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.RATE_LIMIT_MAX = '100000';
process.env.NODE_ENV = 'test';
// Sin salida a internet en el sandbox: fallamos rapido en lugar de esperar 20s por proveedor.
process.env.UPSTREAM_TIMEOUT_MS = '1500';

const { createApp } = await import('../src/app.js');
const { listEndpoints, listCategories, stats } = await import('../src/core/registry.js');
const { evaluate } = await import('../src/core/calc.js');
const { encodeMorse, decodeMorse } = await import('../src/core/morse.js');

const app = createApp();

/* --------------------------- nucleo local --------------------------- */

test('calculadora: aritmetica, precedencia y potencias', () => {
  assert.equal(evaluate('2+3*4').result, 14);
  assert.equal(evaluate('(2+3)*4^2').result, 80);
  assert.equal(evaluate('10%3').result, 1);
  assert.equal(evaluate('-5+2').result, -3);
  assert.equal(evaluate('sqrt(16)').result, 4);
  assert.equal(evaluate('2^3^2').result, 512, 'la potencia es asociativa por la derecha');
  assert.equal(evaluate('3(4+1)').result, 15, 'multiplicacion implicita');
  assert.ok(Math.abs(evaluate('sin(pi/2)').result - 1) < 1e-9);
});

test('calculadora: rechaza entrada peligrosa o invalida', () => {
  assert.throws(() => evaluate('process.exit()'));
  assert.throws(() => evaluate('2+'));
  assert.throws(() => evaluate('(2+3'));
  assert.throws(() => evaluate('foo(1)'));
  assert.throws(() => evaluate(''));
});

test('morse: ida y vuelta', () => {
  assert.equal(encodeMorse('SOS'), '... --- ...');
  assert.equal(encodeMorse('HOLA DENJI'), '.... --- .-.. .- / -.. . -. .--- ..');
  assert.equal(decodeMorse('.... --- .-.. .- / -.. . -. .--- ..'), 'HOLA DENJI');
  assert.equal(decodeMorse(encodeMorse('DENJI API 2026')), 'DENJI API 2026');
});

/* --------------------------- metadatos ------------------------------ */

test('GET /api/status responde ONLINE con el conteo real', async () => {
  const res = await request(app).get('/api/status');
  assert.equal(res.status, 200);
  assert.equal(res.body.state, 'ONLINE');
  assert.equal(res.body.endpoints, stats().endpoints);
  assert.ok(res.body.categories >= 7);
});

test('GET /api/endpoints oculta NSFW por defecto y lo muestra con nsfw=1', async () => {
  const locked = await request(app).get('/api/endpoints');
  assert.equal(locked.status, 200);
  assert.equal(locked.body.nsfw.enabled, false);
  const lockedPaths = locked.body.categories.flatMap((c) => c.endpoints.map((e) => e.path));
  assert.ok(!lockedPaths.some((p) => p.startsWith('/nsfw')), 'no debe exponer rutas NSFW');

  const open = await request(app).get('/api/endpoints?nsfw=1');
  assert.equal(open.body.nsfw.enabled, true);
  const openPaths = open.body.categories.flatMap((c) => c.endpoints.map((e) => e.path));
  assert.ok(openPaths.some((p) => p.startsWith('/nsfw')), 'debe exponer rutas NSFW');
});

test('el catalogo contiene las categorias pedidas', () => {
  const ids = listCategories().map((c) => c.id);
  for (const expected of ['canvas', 'herramientas', 'anime', 'anime-reactions', 'descargas', 'busquedas', 'ai', 'nsfw']) {
    assert.ok(ids.includes(expected), `falta la categoria ${expected}`);
  }
  const canvas = listCategories().find((c) => c.id === 'canvas');
  assert.equal(canvas.empty, true);
  assert.equal(listEndpoints({ category: 'canvas', nsfw: true }).length, 0, 'canvas no tiene endpoints todavia');
  const reactions = listCategories().find((c) => c.id === 'anime-reactions');
  assert.equal(reactions.parent, 'anime', 'anime reactions cuelga de anime');
  assert.ok(listEndpoints({ category: 'anime-reactions', nsfw: true }).length >= 50, 'debe traer las reacciones GIF');
});

test('cada categoria tiene los endpoints solicitados', () => {
  const paths = listEndpoints({ nsfw: true }).map((e) => e.path);
  const expected = [
    '/anime/waifu', '/anime/neko', '/anime/husbando', '/anime/pokemon', '/anime/pokemonbattle',
    '/anime/reactions/hug', '/anime/reactions/pat', '/anime/reactions/kiss',
    '/herramientas/calculadora', '/herramientas/traductor', '/herramientas/morse', '/herramientas/mixed',
    '/descargas/auto', '/descargas/tiktokhd', '/descargas/tiktok', '/descargas/youtube',
    '/descargas/youtubeshort', '/descargas/reel', '/descargas/pinterest', '/descargas/mediafire', '/descargas/apktoide',
    '/busquedas/tiktok', '/busquedas/youtube', '/busquedas/stickerly', '/busquedas/wikipedia',
    '/busquedas/playstore', '/busquedas/spotify', '/busquedas/pinterest', '/busquedas/google', '/busquedas/wallpaper',
    '/ai/chatgpt', '/ai/gemini', '/ai/deepseek', '/ai/stability', '/ai/imagen',
    '/nsfw/tetas', '/nsfw/culos', '/nsfw/anime18', '/nsfw/rule34',
  ];
  for (const route of expected) assert.ok(paths.includes(route), `falta la ruta ${route}`);
});

/* ----------------------------- web ---------------------------------- */

test('la web se sirve en /, /home y en cada categoria', async () => {
  for (const path of ['/', '/home', '/anime', '/anime/reactions', '/herramientas', '/descargas', '/busquedas', '/ai', '/canvas']) {
    const res = await request(app).get(path);
    assert.equal(res.status, 200, `GET ${path} deberia servir la web`);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.text, /id="nsfw-toggle"/, `GET ${path} debe incluir el interruptor NSFW`);
  }
});

test('el interruptor NSFW empieza desactivado en el HTML', async () => {
  const res = await request(app).get('/home');
  assert.match(res.text, /aria-pressed="false"/);
  assert.match(res.text, /class="nsfw-toggle"/);
});

test('GET /style.css y /app.js se sirven', async () => {
  for (const asset of ['/style.css', '/app.js', '/favicon.svg']) {
    const res = await request(app).get(asset);
    assert.equal(res.status, 200, `${asset} deberia existir`);
  }
});

/* ------------------------ endpoints funcionales ---------------------- */

test('GET /herramientas/calculadora devuelve el resultado correcto', async () => {
  const res = await request(app).get('/herramientas/calculadora').query({ expr: '(2+3)*4^2' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, true);
  assert.equal(res.body.data.result, 80);
  assert.equal(res.body.endpoint, '/herramientas/calculadora');
});

test('GET /herramientas/morse detecta la direccion automaticamente', async () => {
  const encoded = await request(app).get('/herramientas/morse').query({ text: 'Hola Denji' });
  assert.equal(encoded.body.data.mode, 'encode');
  assert.equal(encoded.body.data.result, '.... --- .-.. .- / -.. . -. .--- ..');

  const decoded = await request(app).get('/herramientas/morse').query({ text: '.... --- .-.. .- / -.. . -. .--- ..' });
  assert.equal(decoded.body.data.mode, 'decode');
  assert.equal(decoded.body.data.result, 'HOLA DENJI');
});

test('GET /herramientas/mixed genera la URL de Emoji Kitchen', async () => {
  const res = await request(app).get('/herramientas/mixed').query({ emoji1: '😎', emoji2: '🔥' });
  assert.equal(res.status, 200);
  assert.match(res.body.data.url, /^https:\/\/www\.gstatic\.com\/android\/keyboard\/emojikitchen\/\d+\/u1f60e\/u1f60e_u1f525\.png$/);
});

test('GET /herramientas/mixed explica por que una mezcla no existe', async () => {
  const res = await request(app).get('/herramientas/mixed').query({ emoji1: 'a', emoji2: '🔥' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_PARAM');
});

test('GET /anime/reactions/list enumera las reacciones', async () => {
  const res = await request(app).get('/anime/reactions/list');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.total >= 50);
  const slugs = res.body.data.reactions.map((r) => r.slug);
  assert.ok(slugs.includes('hug') && slugs.includes('pat') && slugs.includes('tableflip'));
});

/* ------------------------------ errores ------------------------------ */

test('parametro faltante -> 400 MISSING_PARAM', async () => {
  const res = await request(app).get('/anime/pokemon');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'MISSING_PARAM');
  assert.equal(res.body.error.details.param, 'query');
});

test('URL invalida -> 400 INVALID_PARAM', async () => {
  const res = await request(app).get('/descargas/tiktok').query({ url: 'no soy una url::' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_PARAM');
});

test('ruta inexistente -> 404 con sobre JSON', async () => {
  const res = await request(app).get('/api/esto-no-existe');
  assert.equal(res.status, 404);
  assert.equal(res.body.status, false);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('AI sin clave -> 503 MISSING_API_KEY', async () => {
  for (const [path, envVar] of [
    ['/ai/chatgpt', 'OPENAI_API_KEY'],
    ['/ai/gemini', 'GEMINI_API_KEY'],
    ['/ai/deepseek', 'DEEPSEEK_API_KEY'],
    ['/ai/stability', 'STABILITY_API_KEY'],
    ['/ai/imagen', 'IMAGEN_API_KEY'],
  ]) {
    delete process.env[envVar];
    const res = await request(app).get(path).query({ prompt: 'hola' });
    assert.equal(res.status, 503, `${path} deberia pedir la clave`);
    assert.equal(res.body.error.code, 'MISSING_API_KEY');
  }
});

/* ------------------------------- NSFW -------------------------------- */

test('los endpoints NSFW responden 403 sin el interruptor', async () => {
  for (const path of ['/nsfw/tetas', '/nsfw/culos', '/nsfw/anime18', '/nsfw/rule34']) {
    const res = await request(app).get(path);
    assert.equal(res.status, 403, `${path} debe estar bloqueado`);
    assert.equal(res.body.error.code, 'NSFW_LOCKED');
  }
});

test('el interruptor se acepta por query y por cabecera', async () => {
  const byQuery = await request(app).get('/nsfw/tetas?nsfw=1');
  const byHeader = await request(app).get('/nsfw/tetas').set('x-denji-nsfw', '1');
  for (const res of [byQuery, byHeader]) {
    assert.notEqual(res.status, 403, 'con el interruptor activo no debe dar NSFW_LOCKED');
  }
});

test('NSFW_DISABLED=1 bloquea incluso con el interruptor activo', async () => {
  process.env.NSFW_DISABLED = '1';
  const gateApp = createApp();
  const res = await request(gateApp).get('/nsfw/tetas?nsfw=1');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'NSFW_DISABLED');
  delete process.env.NSFW_DISABLED;
});

/* --------------------------- cobertura total ------------------------- */

test('todas las rutas registradas responden con sobre JSON (no crashean)', async () => {
  const routes = listEndpoints({ nsfw: true });
  const problems = [];

  for (const endpoint of routes) {
    const query = {};
    for (const param of endpoint.params) {
      if (!param.required) continue;
      if (param.type === 'url') query[param.name] = 'https://example.com/asset/12345';
      else if (param.type === 'int') query[param.name] = '1';
      else query[param.name] = param.example ?? 'test';
    }
    const target = endpoint.path + (endpoint.id.includes('rule34') ? '' : '');
    const res = await request(app)
      .get(target)
      .query({ ...query, nsfw: '1' });

    // Sin salida a internet los proveedores devuelven 502/504; eso es esperado.
    // Lo que NO puede pasar: 404 (ruta mal montada) o 500 (bug nuestro).
    if (res.status === 404) problems.push(`${endpoint.path} -> 404 (ruta no montada)`);
    if (res.status === 500) problems.push(`${endpoint.path} -> 500 ${JSON.stringify(res.body?.error)}`);
    if (res.body && typeof res.body === 'object' && !('status' in res.body)) {
      problems.push(`${endpoint.path} -> respuesta sin campo "status"`);
    }
  }

  assert.deepEqual(problems, [], `Rutas con problemas:\n${problems.join('\n')}`);
});
