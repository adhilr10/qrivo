// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
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