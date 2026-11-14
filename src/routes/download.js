import { defineCategory } from '../core/registry.js';
import { ok } from '../core/respond.js';
import { requiredUrl, optional } from '../core/params.js';
import { badRequest, missingParam } from '../core/errors.js';
import { tiktokInfo } from '../providers/tikwm.js';
import { youtubeInfo } from '../providers/youtube.js';
import { instagramInfo } from '../providers/instagram.js';
import { pinterestPin } from '../providers/pinterest.js';
import { mediafireInfo } from '../providers/mediafire.js';
import { aptoideApp } from '../providers/aptoide.js';
import { detectPlatform } from '../providers/platform.js';

const NO_WATERMARK = 'Sin marca de agua';

export const download = defineCategory({
  id: 'descargas',
  name: 'Descargas',
  path: '/descargas',
  icon: '⬇️',
  order: 30,
  description: 'Descarga contenido de TikTok, YouTube, Instagram, Pinterest, Mediafire y Aptoide. Todo sin marca de agua.',
  note: NO_WATERMARK,
});

/** Quita los campos con marca de agua y deja solo lo limpio. */
function clean(tiktok) {
  return {
    ...tiktok,
    video: { noWatermark: tiktok.video.noWatermark, hd: tiktok.video.hd, size: tiktok.video.size },
    watermark: false,
  };
}

download.get('/auto', {
  name: 'Auto',
  description: 'Detecta la plataforma automaticamente y devuelve la descarga sin marca de agua.',
  params: [{ name: 'url', type: 'url', required: true, description: 'Enlace del contenido', example: 'https://vm.tiktok.com/...' }],
  example: '/descargas/auto?url=https://www.tiktok.com/@scout2015/video/6718335390845095173',
}, async (req, res) => {
  const url = requiredUrl(req, 'url', ['link']);
  const platform = detectPlatform(url);
  if (!platform) {
    throw badRequest(`No se reconoce la plataforma de "${url.hostname}". Usa el endpoint especifico de la plataforma.`);
  }
  const handlers = {
    tiktok: () => tiktokInfo(url).then(clean),
    youtubeshort: () => youtubeInfo(url, { preferShort: true }),
    youtube: () => youtubeInfo(url),
    reel: () => instagramInfo(url),
    pinterest: () => pinterestPin(url),
    mediafire: () => mediafireInfo(url),
    apktoide: () => aptoideApp({ url }),
  };
  const data = await handlers[platform]();
  return ok(res, { platform, ...data });
});

download.get('/tiktokhd', {
  name: 'TikTok HD',
  description: 'Descarga un video de TikTok en la maxima calidad disponible, sin marca de agua.',
  params: [{ name: 'url', type: 'url', required: true, description: 'Enlace del video', example: 'https://vm.tiktok.com/...' }],
  example: '/descargas/tiktokhd?url=https://www.tiktok.com/@scout2015/video/6718335390845095173',
}, async (req, res) => {
  const url = requiredUrl(req, 'url', ['link']);
  const data = clean(await tiktokInfo(url, { hd: true }));
  if (!data.video.hd) data.warning = 'El autor no subio version HD; se entrega la calidad estandar.';
  return ok(res, data);
});

download.get('/tiktok', {
  name: 'TikTok',
  description: 'Descarga un video de TikTok sin marca de agua, con metadatos y musica.',
  params: [{ name: 'url', type: 'url', required: true, description: 'Enlace del video', example: 'https://vm.tiktok.com/...' }],
  example: '/descargas/tiktok?url=https://www.tiktok.com/@scout2015/video/6718335390845095173',
}, async (req, res) => ok(res, clean(await tiktokInfo(requiredUrl(req, 'url', ['link'])))));

download.get('/youtube', {
  name: 'YouTube Video',
  description: 'Metadatos y enlaces de descarga de un video de YouTube, sin marca de agua.',
  params: [{ name: 'url', type: 'url', required: true, description: 'Enlace del video', example: 'https://youtu.be/dQw4w9WgXcQ' }],
  example: '/descargas/youtube?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ',
}, async (req, res) => {
  const data = await youtubeInfo(requiredUrl(req, 'url', ['link', 'video']));
  return ok(res, { ...data, watermark: false });
});

download.get('/youtubeshort', {
  name: 'YouTube Short',
  description: 'Descarga un Short de YouTube sin marca de agua.',
  params: [{ name: 'url', type: 'url', required: true, description: 'Enlace del Short', example: 'https://youtube.com/shorts/XXXX' }],
  example: '/descargas/youtubeshort?url=https://www.youtube.com/shorts/dQw4w9WgXcQ',
}, async (req, res) => {
  const data = await youtubeInfo(requiredUrl(req, 'url', ['link', 'video']), { preferShort: true });
  return ok(res, { ...data, watermark: false });
});

download.get('/reel', {
  name: 'Reel',
  description: 'Descarga un Reel o post de Instagram (contenido publico) sin marca de agua.',
  params: [{ name: 'url', type: 'url', required: true, description: 'Enlace del Reel', example: 'https://www.instagram.com/reel/XXXX/' }],
  example: '/descargas/reel?url=https://www.instagram.com/reel/C9xYz8ZpQnB/',
}, async (req, res) => ok(res, { ...(await instagramInfo(requiredUrl(req, 'url', ['link']))), watermark: false }));

download.get('/pinterest', {
  name: 'Pinterest',
  description: 'Descarga el video o la imagen de un pin de Pinterest en maxima calidad, sin marca de agua.',
  params: [{ name: 'url', type: 'url', required: true, description: 'Enlace del pin', example: 'https://www.pinterest.com/pin/123456789/' }],
  example: '/descargas/pinterest?url=https://www.pinterest.com/pin/303649272476675148/',
}, async (req, res) => ok(res, { ...(await pinterestPin(requiredUrl(req, 'url', ['link']))), watermark: false }));

download.get('/mediafire', {
  name: 'Mediafire',
  description: 'Resuelve el enlace directo de un archivo de Mediafire.',
  params: [{ name: 'url', type: 'url', required: true, description: 'Enlace del archivo', example: 'https://www.mediafire.com/file/xxxx/file' }],
  example: '/descargas/mediafire?url=https://www.mediafire.com/file/1a2b3c4d5e6f7g8/file',
}, async (req, res) => ok(res, await mediafireInfo(requiredUrl(req, 'url', ['link']))));

download.get('/apktoide', {
  name: 'Apktoide',
  description: 'Descarga el APK de una aplicacion desde Aptoide, sin marca de agua ni modificadores.',
  params: [
    { name: 'url', type: 'url', description: 'Enlace de la app en Aptoide', example: 'https://spotify.en.aptoide.com/app' },
    { name: 'package', type: 'text', description: 'Package name', example: 'com.spotify.music' },
    { name: 'query', type: 'text', description: 'Nombre de la app (busca la mejor coincidencia)', example: 'spotify' },
  ],
  example: '/descargas/apktoide?package=com.spotify.music',
}, async (req, res) => {
  const rawUrl = optional(req, 'url', null, ['link']);
  const packageName = optional(req, 'package', null, ['pkg']);
  const query = optional(req, 'query', null, ['q', 'app']);

  if (!rawUrl && !packageName && !query) throw missingParam('query');
  const url = rawUrl ? requiredUrl(req, 'url') : null;
  return ok(res, await aptoideApp({ url, packageName, query }));
});
