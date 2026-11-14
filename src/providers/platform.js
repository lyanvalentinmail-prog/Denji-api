/** Detecta la plataforma de una URL para el endpoint /descargas/auto. */
export function detectPlatform(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  if (/(^|\.)tiktok\.com$|vm\.tiktok\.com|vt\.tiktok\.com/.test(host)) return 'tiktok';
  if (/(^|\.)douyin\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)youtube\.com$|youtu\.be$|youtube-nocookie\.com$/.test(host)) {
    if (/\/shorts\//.test(url.pathname)) return 'youtubeshort';
    return 'youtube';
  }
  if (/(^|\.)instagram\.com$|instagr\.am$/.test(host)) return 'reel';
  if (/(^|\.)facebook\.com$|fb\.watch$|fb\.com$/.test(host)) return 'reel';
  if (/pinterest\./.test(host) || host === 'pin.it') return 'pinterest';
  if (/mediafire\.com$/.test(host)) return 'mediafire';
  if (/aptoide\.com$/.test(host)) return 'apktoide';

  return null;
}

export const PLATFORM_LABELS = {
  tiktok: 'TikTok',
  tiktokhd: 'TikTok HD',
  youtube: 'YouTube',
  youtubeshort: 'YouTube Short',
  reel: 'Instagram Reel',
  pinterest: 'Pinterest',
  mediafire: 'Mediafire',
  apktoide: 'Aptoide',
};
