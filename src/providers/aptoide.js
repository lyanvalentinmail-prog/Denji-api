import { getJson, buildUrl } from '../core/http.js';
import { upstream, notFound } from '../core/errors.js';

const HOST = () => process.env.APTOIDE_HOST || 'https://ws75.aptoide.com';

/** Extrae el package de una URL de Aptoide. */
export function aptoidePackage(url) {
  const patterns = [
    /aptoide\.com\/(?:[a-z]{2}\/)?app\/[^/]+\/([^/?#]+)/i,
    /\/app\/[^/]+\/([a-z0-9_.]+)(?:\/\d+)?\/?$/i,
    /^([a-z0-9_.]+)\.[a-z]{2,}\.aptoide\.com$/i,
  ];
  for (const re of patterns) {
    const m = re.exec(url.href) || re.exec(url.hostname);
    if (m && m[1].includes('.')) return m[1];
  }
  return null;
}

function normalize(app) {
  if (!app) return null;
  return {
    id: app.id ?? null,
    name: app.name ?? null,
    package: app.package ?? null,
    version: app.file?.vername ?? null,
    versionCode: app.file?.vercode ?? null,
    size: app.file?.size ? Number(app.file.size) : null,
    sizeReadable: app.file?.size ? `${(Number(app.file.size) / 1048576).toFixed(2)} MB` : null,
    icon: app.icon ?? null,
    graphic: app.graphic ?? null,
    store: app.store?.name ?? app.store_name ?? null,
    rating: app.stats?.rating?.avg ?? app.rating?.avg ?? null,
    downloads: app.stats?.downloads ?? null,
    apk: app.file?.path ?? null,
    watermark: false,
    page: app.package ? `https://en.aptoide.com/app/${app.package}` : null,
  };
}

/**
 * Descarga de APK desde Aptoide.
 * Acepta la URL de la app o su package name; si se pasa "query", busca la mejor coincidencia.
 */
export async function aptoideApp({ url = null, query = null, packageName = null }) {
  const host = HOST();

  if (packageName) {
    const json = await getJson(buildUrl(`${host}/api/7/apps/get`, { package: packageName }), { provider: 'Aptoide' });
    if (json?.info?.status !== 'OK' || !json.data) {
      throw notFound(`No se encontro el paquete "${packageName}" en Aptoide.`);
    }
    return { ...normalize(json.data), source: 'aptoide.com', query: packageName };
  }

  if (url) {
    const pkg = aptoidePackage(url);
    if (pkg) return aptoideApp({ packageName: pkg });
  }

  const term = query ?? (url ? url.hostname : null);
  if (!term) throw upstream('Aptoide', 'Debes enviar url, package o query.');

  const json = await getJson(
    buildUrl(`${host}/api/7/apps/search`, { query: term, limit: 10 }),
    { provider: 'Aptoide' },
  );
  const list = json?.datalist ?? json?.data ?? [];
  if (!list.length) throw notFound(`No hay resultados en Aptoide para "${term}".`);

  const best = list[0];
  // El listado de busqueda a veces no trae el enlace del APK: se completa con apps/get.
  if (!best?.file?.path && best?.package) {
    return aptoideApp({ packageName: best.package });
  }
  return { ...normalize(best), source: 'aptoide.com', query: term };
}
