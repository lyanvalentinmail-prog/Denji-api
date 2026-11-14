import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

process.env.RATE_LIMIT_MAX = '100000';
process.env.NODE_ENV = 'test';

const { createApp } = await import('../src/app.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HTML = readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const APP_JS = readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const CSS = readFileSync(path.join(ROOT, 'public/style.css'), 'utf8');

/* ------------------------ servidor real de apoyo --------------------- */

const server = createApp().listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;

test.after(() => server.close());

/** Monta el DOM real con index.html + app.js apuntando al servidor real. */
async function loadPage() {
  const dom = new JSDOM(HTML, { url: `${BASE}/home`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;

  // jsdom no implementa estas dos APIs que usa app.js.
  window.Element.prototype.scrollIntoView = () => {};
  window.fetch = (input, init) => globalThis.fetch(new URL(String(input), BASE).toString(), init);

  window.eval(APP_JS);

  // Espera a que el loadCatalog() del arranque termine.
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (window.document.querySelector('#app .card, #app .empty')) break;
  }
  return window;
}

const gateOf = (window) => window.document.getElementById('gate');
const isOpen = (window) => gateOf(window).classList.contains('is-open');
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));

/* ------------------------------ el bug ------------------------------- */

test('regresion: el CSS oculta .gate por defecto y la muestra solo con .is-open', () => {
  // El fallo original: `.gate { display: grid }` gana SIEMPRE sobre el
  // `[hidden] { display: none }` del user-agent stylesheet (origen autor >
  // origen UA, sin importar especificidad). El atributo hidden no hacia nada,
  // el modal tapaba la pagina desde la carga y los botones parecian muertos.
  const gateRule = /\.gate\s*\{[^}]*\}/.exec(CSS);
  assert.ok(gateRule, 'debe existir la regla .gate');
  assert.match(gateRule[0], /display:\s*none/, '.gate debe ocultarse con display:none');

  const openRule = /\.gate\.is-open\s*\{[^}]*\}/.exec(CSS);
  assert.ok(openRule, 'debe existir la regla .gate.is-open');
  assert.match(openRule[0], /display:\s*grid/, '.gate.is-open debe mostrar el modal');

  assert.ok(!HTML.includes('id="gate"') || !/<div id="gate"[^>]*\bhidden\b/.test(HTML),
    'el markup no debe depender del atributo hidden');
});

test('el modal de +18 empieza oculto', async () => {
  const window = await loadPage();
  assert.equal(isOpen(window), false, 'el gate no debe estar abierto al cargar');
  assert.equal(window.localStorage.getItem('denji.nsfw'), null);
  window.close();
});

test('el interruptor abre el modal de confirmacion', async () => {
  const window = await loadPage();
  const toggle = window.document.getElementById('nsfw-toggle');

  assert.equal(toggle.getAttribute('aria-pressed'), 'false', 'el interruptor empieza apagado');
  click(toggle);

  assert.equal(isOpen(window), true, 'al pulsar el interruptor debe abrirse el modal');
  assert.equal(window.localStorage.getItem('denji.nsfw'), null, 'abrir el modal no debe activar nada todavia');
  window.close();
});

test('el boton "Tengo 18+, activar" cierra el modal y activa NSFW', async () => {
  const window = await loadPage();
  const doc = window.document;

  click(doc.getElementById('nsfw-toggle'));
  assert.equal(isOpen(window), true);

  const confirm = doc.querySelector('[data-gate="confirm"]');
  assert.ok(confirm, 'debe existir el boton de confirmacion');
  assert.match(confirm.textContent, /18/);
  click(confirm);

  // Aca estaba el fallo: el modal nunca desaparecia.
  assert.equal(isOpen(window), false, 'el modal debe cerrarse al confirmar');
  assert.equal(window.localStorage.getItem('denji.nsfw'), '1', 'debe quedar guardado');
  assert.equal(doc.getElementById('nsfw-toggle').getAttribute('aria-pressed'), 'true');

  // Y el catalogo se recarga mostrando la categoria NSFW.
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 25));
    if (doc.body.textContent.toLowerCase().includes('nsfw')) break;
  }
  assert.match(doc.getElementById('app').textContent, /NSFW/i, 'la categoria NSFW debe aparecer en la web');
  window.close();
});

test('el boton "Cancelar" cierra el modal sin activar nada', async () => {
  const window = await loadPage();
  const doc = window.document;

  click(doc.getElementById('nsfw-toggle'));
  assert.equal(isOpen(window), true);

  click(doc.querySelector('[data-gate="cancel"]'));

  assert.equal(isOpen(window), false, 'el modal debe cerrarse al cancelar');
  assert.equal(window.localStorage.getItem('denji.nsfw'), null, 'cancelar no debe activar NSFW');
  assert.equal(doc.getElementById('nsfw-toggle').getAttribute('aria-pressed'), 'false');
  window.close();
});

test('la tecla Escape cierra el modal', async () => {
  const window = await loadPage();
  click(window.document.getElementById('nsfw-toggle'));
  assert.equal(isOpen(window), true);

  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(isOpen(window), false);
  window.close();
});

test('con NSFW ya activado el interruptor lo apaga directamente', async () => {
  // Arranca con la preferencia guardada de una visita anterior.
  const dom = new JSDOM(HTML, { url: `${BASE}/home`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.Element.prototype.scrollIntoView = () => {};
  window.fetch = (input, init) => globalThis.fetch(new URL(String(input), BASE).toString(), init);
  window.localStorage.setItem('denji.nsfw', '1');

  window.eval(APP_JS);
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 25));
    if (window.document.querySelector('#app .card')) break;
  }

  const toggle = window.document.getElementById('nsfw-toggle');
  assert.equal(toggle.getAttribute('aria-pressed'), 'true', 'debe arrancar activado');

  click(toggle);
  assert.equal(window.localStorage.getItem('denji.nsfw'), null, 'debe desactivarse sin abrir el modal');
  assert.equal(isOpen(window), false);

  // Deja que el loadCatalog() del apagado termine antes de cerrar el DOM,
  // si no el fetch queda colgando y revienta despues de acabar el test.
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 25));
    if (toggle.getAttribute('aria-pressed') === 'false') break;
  }
  await new Promise((r) => setTimeout(r, 100));
  window.close();
});
