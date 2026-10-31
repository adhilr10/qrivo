// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

import cloudflare from '@astrojs/cloudflare';
import imagekit from '@imagekit/astro/integration';

// ImageKit is optional: when no URL endpoint is configured the integration is
// skipped so local builds keep working. Uploads still need the API keys (see
// /api/upload-auth).
const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
const imagekitUrlEndpoint = (process.env.IMAGEKIT_URL_ENDPOINT || env.IMAGEKIT_URL_ENDPOINT || '').trim();

// https://astro.build/config
export default defineConfig({
  integrations: imagekitUrlEndpoint ? [imagekit({ urlEndpoint: imagekitUrlEndpoint })] : [],

  vite: {
    // `sharp` is a native Node module used only by /api/qr-card. Keeping it
    // external stops Vite from trying to bundle it for Cloudflare Workers;
    // the route falls back to a 501 there and the browser renders the card.
    ssr: {
      external: ['sharp'],
    },
    resolve: {
      // Supabase only loads this module in Node runtimes that lack global fetch.
      // Browsers always have fetch, so this keeps a partially installed legacy
      // dependency tree from breaking the client bundle.
      alias: {
        '@supabase/node-fetch': fileURLToPath(new URL('./src/lib/node-fetch-browser.ts', import.meta.url)),
      },
    },
  },

  adapter: cloudflare(),
});