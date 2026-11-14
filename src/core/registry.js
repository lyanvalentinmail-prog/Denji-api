import { Router } from 'express';
import { toResponse } from './respond.js';

/**
 * Registro global de categorias y endpoints.
 *
 * La web, /api/endpoints y el router de Express se generan desde aqui,
 * asi que la documentacion nunca se desincroniza de la implementacion.
 */
const categories = [];
const endpoints = [];
const byId = new Map();

/**
 * @typedef {object} ParamDef
 * @property {string} name
 * @property {string} [type]
 * @property {boolean} [required]
 * @property {string} [description]
 * @property {string} [example]
 * @property {string} [default]
 * @property {string[]} [enum]
 */

/**
 * @typedef {object} EndpointMeta
 * @property {string} id           Identificador unico: `<categoria>.<nombre>`
 * @property {string} name         Nombre visible en la web
 * @property {string} path         Ruta completa, ej. `/anime/waifu`
 * @property {string} method
 * @property {string} description
 * @property {ParamDef[]} params
 * @property {string} [example]    Ruta de ejemplo con query para el boton RUN
 * @property {boolean} [nsfw]
 * @property {string} [group]      Subgrupo dentro de la categoria
 * @property {string} [source]     Proveedor externo principal
 */

/** Registra una categoria. Devuelve un helper para registrar sus endpoints. */
export function defineCategory(meta) {
  const category = {
    id: meta.id,
    name: meta.name,
    path: meta.path ?? `/${meta.id}`,
    description: meta.description ?? '',
    icon: meta.icon ?? null,
    order: meta.order ?? categories.length,
    nsfw: meta.nsfw ?? false,
    empty: meta.empty ?? false,
    note: meta.note ?? null,
    parent: meta.parent ?? null,
  };
  categories.push(category);
  byId.set(category.id, category);
  return createRegistrar(category);
}

function createRegistrar(category) {
  const router = Router();
  /** Middlewares que se aplican a cada endpoint registrado despues del use(). */
  const guards = [];

  const register = (method, route, meta, handler) => {
    const path = `${category.path}${route}`;
    /** @type {EndpointMeta} */
    const entry = {
      id: `${category.id}.${String(meta.name).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      name: meta.name,
      category: category.id,
      path,
      method: method.toUpperCase(),
      description: meta.description ?? '',
      params: meta.params ?? [],
      example: meta.example ?? path,
      nsfw: meta.nsfw ?? category.nsfw ?? false,
      group: meta.group ?? category.group ?? null,
      source: meta.source ?? null,
      requiresNsfw: category.nsfw || meta.nsfw || false,
    };
    endpoints.push(entry);
    // Los guards van por endpoint, no con router.use(): asi la ruta raiz de la
    // categoria queda libre para servir la pagina web.
    router[method](route, ...guards, async (req, res, next) => {
      try {
        await handler(req, res, next);
      } catch (err) {
        toResponse(err, req, res);
      }
    });
    return entry;
  };

  return {
    category,
    router,
    /** Aplica un middleware a todos los endpoints registrados a partir de aqui. */
    use: (middleware) => {
      guards.push(middleware);
    },
    get: (route, meta, handler) => register('get', route, meta, handler),
    post: (route, meta, handler) => register('post', route, meta, handler),
    /** Registra la misma ruta para GET y POST (util en los endpoints de IA). */
    any: (route, meta, handler) => {
      const g = register('get', route, meta, handler);
      register('post', route, { ...meta, method: 'POST' }, handler);
      return g;
    },
  };
}

/** Todas las categorias ordenadas. Con topLevelOnly se omiten las subcarpetas. */
export function listCategories({ topLevelOnly = false } = {}) {
  return [...categories]
    .filter((c) => (topLevelOnly ? !c.parent : true))
    .sort((a, b) => a.order - b.order);
}

/** Subcategorias (carpetas) que cuelgan de una categoria. */
export function listSubcategories(parentId) {
  return categories.filter((c) => c.parent === parentId).sort((a, b) => a.order - b.order);
}

/** Todos los endpoints, opcionalmente filtrando los NSFW. */
export function listEndpoints({ nsfw = false, category = null } = {}) {
  return endpoints.filter((e) => (nsfw || !e.requiresNsfw) && (!category || e.category === category));
}

export function findCategory(id) {
  return byId.get(id);
}

export function stats() {
  return {
    categories: categories.length,
    endpoints: endpoints.length,
    publicEndpoints: listEndpoints({ nsfw: false }).length,
    nsfwEndpoints: endpoints.filter((e) => e.requiresNsfw).length,
  };
}
