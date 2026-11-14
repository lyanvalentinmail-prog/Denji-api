import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { rateLimit } from './core/ratelimit.js';
import { nsfwRequested, nsfwHardDisabled, NSFW_HEADER } from './core/nsfw.js';
import { BRAND, fail } from './core/respond.js';
import { listCategories, listEndpoints, listSubcategories, stats } from './core/registry.js';

import * as routes from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = path.resolve(__dirname, '../public');

const VERSION = '1.0.0';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use((req, res, next) => {
    res.locals.tookMs = Date.now();
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', `Content-Type, Authorization, ${NSFW_HEADER}`);
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });

  app.use(rateLimit({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_MAX || 180) }));

  /* --------------------------- Metadatos ---------------------------- */
  app.get('/api', (req, res) => {
    res.json({
      status: true,
      name: BRAND.name,
      version: VERSION,
      creator: BRAND.creator,
      description: 'API REST publica y gratuita. Sin API keys para la mayoria de los endpoints.',
      base: `${req.protocol}://${req.get('host')}`,
      nsfw: { enabled: nsfwRequested(req), serverDisabled: nsfwHardDisabled() },
      ...stats(),
      routes: listCategories({ topLevelOnly: true }).map((c) => ({
        name: c.name,
        path: c.path,
        endpoints: listEndpoints({ nsfw: true, category: c.id }).length
          + listSubcategories(c.id).reduce((acc, sub) => acc + listEndpoints({ nsfw: true, category: sub.id }).length, 0),
      })),
      docs: '/home',
    });
  });

  /** Catalogo completo. Con ?nsfw=1 incluye los endpoints para adultos. */
  app.get('/api/endpoints', (req, res) => {
    const showNsfw = nsfwRequested(req);
    res.json({
      status: true,
      creator: BRAND.creator,
      nsfw: { enabled: showNsfw, serverDisabled: nsfwHardDisabled() },
      ...stats(),
      categories: listCategories().map((category) => ({
        ...category,
        endpoints: listEndpoints({ nsfw: showNsfw, category: category.id }),
      })),
    });
  });

  /** Buscador de endpoints por nombre, ruta o descripcion. */
  app.get('/api/search', (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const showNsfw = nsfwRequested(req);
    const all = listEndpoints({ nsfw: showNsfw });
    const results = q
      ? all.filter((e) => `${e.name} ${e.path} ${e.description}`.toLowerCase().includes(q))
      : all;
    res.json({ status: true, query: q || null, total: results.length, results });
  });

  app.get('/api/status', (req, res) => {
    res.json({
      status: true,
      state: 'ONLINE',
      uptime: Math.floor(process.uptime()),
      memory: `${(process.memoryUsage().rss / 1048576).toFixed(1)} MB`,
      runtime: `Node ${process.version}`,
      platform: process.env.VERCEL ? 'vercel' : 'standalone',
      ...stats(),
      env: {
        openai: Boolean(process.env.OPENAI_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
        deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
        stability: Boolean(process.env.STABILITY_API_KEY),
        spotify: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
        rule34: Boolean(process.env.RULE34_USER_ID && process.env.RULE34_API_KEY),
        nsfw: !nsfwHardDisabled(),
      },
      timestamp: new Date().toISOString(),
    });
  });

  /* -------------------------- Endpoints ----------------------------- */
  const registrars = [
    routes.canvas,
    routes.tools,
    routes.anime,
    routes.reactions,
    routes.download,
    routes.search,
    routes.ai,
    routes.nsfw,
  ];
  for (const registrar of registrars) {
    // Cada categoria se monta en su ruta. La puerta NSFW vive dentro de su propio
    // router para no interceptar la pagina web de la categoria.
    app.use(registrar.category.path, registrar.router);
  }

  /* ----------------------------- Web -------------------------------- */
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '5m' }));

  const spaPaths = ['/', '/home', ...listCategories().map((c) => c.path)];
  for (const spaPath of [...new Set(spaPaths)]) {
    app.get(spaPath, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
  }

  /* --------------------------- 404 / errores ------------------------ */
  app.use((req, res) => {
    const wantsJson = req.path.startsWith('/api') || req.accepts(['html', 'json']) === 'json';
    if (wantsJson) {
      return fail(res, 404, 'NOT_FOUND', `No existe la ruta ${req.method} ${req.path}.`, {
        hint: 'Consulta /api/endpoints para ver todo el catalogo.',
      });
    }
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') return fail(res, 400, 'BAD_JSON', 'El cuerpo JSON no es valido.');
    return fail(res, 500, 'INTERNAL_ERROR', process.env.NODE_ENV === 'production' ? 'Error interno.' : String(err.message ?? err));
  });

  return app;
}

export default createApp;
