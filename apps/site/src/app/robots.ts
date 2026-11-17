import type { MetadataRoute } from 'next';
import { origemDoSite } from '../origem';

/** Tudo aberto, menos a vitrine de componentes em `/dev/`. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/dev/' },
    sitemap: new URL('/sitemap.xml', origemDoSite()).href,
  };
}
