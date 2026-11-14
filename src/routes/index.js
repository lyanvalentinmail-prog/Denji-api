/**
 * Punto unico que carga todas las categorias.
 * Al importar este modulo queda poblado el registro global.
 */
import { defineCategory } from '../core/registry.js';

export { anime, reactions } from './anime.js';
export { tools } from './tools.js';
export { download } from './download.js';
export { search } from './search.js';
export { ai } from './ai.js';
export { nsfw } from './nsfw.js';

/** Canvas: categoria reservada, sin endpoints por ahora. */
export const canvas = defineCategory({
  id: 'canvas',
  name: 'Canvas',
  path: '/canvas',
  icon: '🎨',
  order: 0,
  empty: true,
  description: 'Manipulacion y generacion de imagenes. Categoria reservada, sin endpoints por ahora.',
  note: 'Proximamente',
});
