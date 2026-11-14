/* Denji API — frontend minimalista (sin frameworks). */

const STORAGE_KEY = 'denji.nsfw';
const app = document.getElementById('app');
const toggle = document.getElementById('nsfw-toggle');
const gate = document.getElementById('gate');
const footStats = document.getElementById('foot-stats');

const state = {
  catalog: null,
  nsfw: localStorage.getItem(STORAGE_KEY) === '1',
  filter: '',
};

/* ------------------------------ helpers ----------------------------- */
const h = (tag, attrs = {}, children = []) => {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
};

const paramSummary = (params = []) => {
  if (!params.length) return 'sin parametros';
  return params.map((p) => `${p.name}${p.required ? '*' : ''}`).join(', ');
};

const absolute = (path) => {
  const url = new URL(path, window.location.origin);
  if (state.nsfw) url.searchParams.set('nsfw', '1');
  return url;
};

/* -------------------------------- data ------------------------------ */
async function loadCatalog() {
  const res = await fetch(`/api/endpoints${state.nsfw ? '?nsfw=1' : ''}`);
  state.catalog = await res.json();
  footStats.textContent = `${state.catalog.categories.length} routers · ${
    state.nsfw ? state.catalog.endpoints : state.catalog.publicEndpoints
  } endpoints`;
  render();
}

/* ------------------------------- views ------------------------------ */
function categoryCard(category) {
  const count = state.catalog.categories
    .filter((c) => c.id === category.id || c.parent === category.id)
    .reduce((acc, c) => acc + c.endpoints.length, 0);

  return h('a', {
    class: `card${category.nsfw ? ' card--nsfw' : ''}${category.empty ? ' card--empty' : ''}`,
    href: category.path,
    'data-link': true,
  }, [
    h('div', { class: 'card__name', text: `${category.icon ? category.icon + ' ' : ''}${category.name}` }),
    h('div', { class: 'card__desc', text: category.description }),
    h('div', { class: 'card__foot' }, [
      h('span', { text: category.empty ? category.note || 'vacio' : `${count} endpoints` }),
      h('span', { class: 'card__view', text: category.empty ? '' : 'view →' }),
    ]),
  ]);
}

function endpointRow(endpoint) {
  const run = h('button', { class: 'run', type: 'button', text: 'run' });
  run.addEventListener('click', () => execute(endpoint, run));
  return h('div', { class: 'row' }, [
    h('div', { class: 'row__name' }, [
      document.createTextNode(endpoint.name),
      h('small', { text: endpoint.description }),
    ]),
    h('div', { class: 'row__meta' }, [
      h('span', { class: `method${endpoint.method === 'POST' ? ' method--post' : ''}`, text: endpoint.method }),
      h('span', { text: `— ${paramSummary(endpoint.params)}` }),
      h('span', { class: 'row__path', text: endpoint.path }),
    ]),
    run,
  ]);
}

async function execute(endpoint, button) {
  const url = absolute(endpoint.example);
  const viewer = document.getElementById('viewer') || mountViewer();
  const bar = viewer.querySelector('.viewer__bar');
  const body = viewer.querySelector('.viewer__body');

  button.disabled = true;
  button.textContent = '...';
  bar.replaceChildren(
    h('span', { class: 'status-dot' }),
    h('span', { text: endpoint.method }),
    h('span', { class: 'viewer__url', text: url.toString() }),
  );
  body.replaceChildren(h('pre', { text: 'consultando…' }));
  viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    const started = performance.now();
    const res = await fetch(url);
    const ms = Math.round(performance.now() - started);
    const json = await res.json();
    bar.querySelector('.status-dot').classList.add(res.ok ? 'ok' : 'err');
    bar.append(h('span', { text: `HTTP ${res.status} · ${ms}ms` }));
    body.replaceChildren(preview(json), h('pre', { text: JSON.stringify(json, null, 2) }));
  } catch (err) {
    bar.querySelector('.status-dot').classList.add('err');
    body.replaceChildren(h('pre', { text: `Error de red: ${err.message}` }));
  } finally {
    button.disabled = false;
    button.textContent = 'run';
  }
}

/** Muestra imagen, video o audio si la respuesta apunta a un archivo multimedia. */
function preview(json) {
  const data = json?.data;
  const candidates = [
    data?.url, data?.video?.noWatermark, data?.image, data?.directUrl, data?.apk,
    data?.sprites?.artwork, data?.image?.dataUrl, data?.images?.[0], data?.wallpapers?.[0]?.image,
  ].filter(Boolean);

  for (const src of candidates) {
    if (/^(data:image|https?:\/\/\S+\.(png|jpe?g|gif|webp|svg))/i.test(src)) {
      return h('img', { src, alt: '', loading: 'lazy' });
    }
    if (/^https?:\/\/\S+\.mp4(\?|$)/i.test(src)) {
      return h('video', { src, controls: true, preload: 'metadata' });
    }
  }
  return h('span');
}

function mountViewer() {
  const viewer = h('div', { class: 'viewer', id: 'viewer' }, [
    h('div', { class: 'viewer__bar' }),
    h('div', { class: 'viewer__body' }),
  ]);
  app.append(viewer);
  return viewer;
}

function renderHome() {
  const top = state.catalog.categories.filter((c) => !c.parent && (state.nsfw || !c.nsfw));
  app.replaceChildren(
    h('div', { class: 'page-head' }, [
      h('h1', { text: 'Denji API' }),
      h('p', {
        text: 'API REST publica y gratuita, sin API keys ni registro. Elige una categoria para ver sus endpoints y probarlos con un clic.',
      }),
      h('div', { class: 'badges' }, [
        h('span', { class: 'badge badge--ok', text: 'status: online' }),
        h('span', { class: 'badge', text: `${state.catalog.endpoints} endpoints` }),
        h('span', { class: 'badge', text: 'sin token requerido' }),
      ]),
    ]),
    h('div', { class: 'grid' }, top.map(categoryCard)),
  );
}

function renderCategory(category) {
  const subs = state.catalog.categories.filter((c) => c.parent === category.id);
  const parent = category.parent ? state.catalog.categories.find((c) => c.id === category.parent) : null;
  const endpoints = category.endpoints;

  const filterInput = h('input', {
    type: 'search',
    placeholder: 'filtrar endpoints…',
    value: state.filter,
  });
  filterInput.addEventListener('input', (event) => {
    state.filter = event.target.value;
    renderList();
  });

  const listWrap = h('div', { id: 'endpoint-list' });
  const renderList = () => {
    const q = state.filter.trim().toLowerCase();
    const visible = q
      ? endpoints.filter((e) => `${e.name} ${e.path} ${e.description}`.toLowerCase().includes(q))
      : endpoints;
    listWrap.replaceChildren(
      visible.length
        ? h('div', {}, visible.map(endpointRow))
        : h('div', { class: 'empty', text: 'No hay endpoints que coincidan con el filtro.' }),
    );
  };
  renderList();

  app.replaceChildren(
    h('div', { class: 'crumbs' }, [
      h('a', { href: '/home', 'data-link': true, text: 'home' }),
      h('span', { class: 'sep', text: '/' }),
      ...(parent ? [h('a', { href: parent.path, 'data-link': true, text: parent.name.toLowerCase() }), h('span', { class: 'sep', text: '/' })] : []),
      h('span', { text: category.name.toLowerCase() }),
    ]),
    h('div', { class: 'page-head' }, [
      h('h1', { text: `${category.icon ? category.icon + ' ' : ''}${category.name}` }),
      h('p', { text: category.description }),
      h('div', { class: 'badges' }, [
        h('span', { class: 'badge', text: `${endpoints.length} endpoints` }),
        category.nsfw ? h('span', { class: 'badge badge--nsfw', text: '+18 activado' }) : null,
        category.note ? h('span', { class: 'badge', text: category.note }) : null,
      ].filter(Boolean)),
    ]),
    subs.length
      ? h('div', {}, [
          h('div', { class: 'group-title', text: 'carpetas' }),
          h('div', { class: 'grid' }, subs.map(categoryCard)),
        ])
      : null,
    endpoints.length
      ? h('div', {}, [
          h('div', { class: 'toolbar' }, [filterInput]),
          listWrap,
        ])
      : h('div', { class: 'empty', text: category.empty ? 'Categoria reservada. Todavia no hay endpoints aqui.' : 'Sin endpoints visibles.' }),
  );
}

function renderLocked(category) {
  const activate = h('button', { class: 'btn btn--danger', type: 'button', text: 'activar +18' });
  activate.addEventListener('click', openGate);
  app.replaceChildren(
    h('div', { class: 'page-head' }, [
      h('h1', { text: `${category.icon ?? '🔞'} ${category.name}` }),
      h('p', { text: category.description }),
    ]),
    h('div', { class: 'empty' }, [
      h('p', { text: 'Seccion bloqueada. El interruptor de la esquina superior derecha esta apagado.' }),
      h('div', { style: 'margin-top:1rem' }, [activate]),
    ]),
  );
}

function render() {
  if (!state.catalog) return;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '' || path === '/home') return renderHome();
  const category = state.catalog.categories.find((c) => c.path === path);
  if (!category) return renderHome();
  if (category.nsfw && !state.nsfw) return renderLocked(category);
  return renderCategory(category);
}

/* --------------------------- interruptor NSFW ----------------------- */
function paintToggle() {
  toggle.setAttribute('aria-pressed', String(state.nsfw));
  toggle.setAttribute('aria-label', state.nsfw ? 'Desactivar contenido NSFW' : 'Activar contenido NSFW');
  toggle.title = state.nsfw ? 'Contenido +18 (activado)' : 'Contenido +18 (desactivado)';
}

function setNsfw(value) {
  state.nsfw = value;
  if (value) localStorage.setItem(STORAGE_KEY, '1');
  else localStorage.removeItem(STORAGE_KEY);
  paintToggle();
  loadCatalog();
}

function openGate() {
  gate.classList.add('is-open');
  gate.querySelector('[data-gate="confirm"]')?.focus();
}

function closeGate() {
  gate.classList.remove('is-open');
}

toggle.addEventListener('click', () => {
  if (state.nsfw) return setNsfw(false);
  openGate();
});

gate.addEventListener('click', (event) => {
  const action = event.target.closest?.('[data-gate]')?.getAttribute('data-gate');
  if (action === 'confirm') {
    closeGate();
    setNsfw(true);
  } else if (action === 'cancel' || event.target === gate) {
    closeGate();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && gate.classList.contains('is-open')) closeGate();
});

/* ------------------------------ routing ----------------------------- */
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-link]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (!href || href.startsWith('http')) return;
  event.preventDefault();
  window.history.pushState({}, '', href);
  state.filter = '';
  render();
});

window.addEventListener('popstate', () => {
  state.filter = '';
  render();
});

/* -------------------------------- boot ------------------------------ */
paintToggle();
loadCatalog().catch((err) => {
  app.replaceChildren(h('div', { class: 'empty', text: `No se pudo cargar el catalogo: ${err.message}` }));
});
