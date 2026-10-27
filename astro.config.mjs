// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

// https://astro.build/config
export default defineConfig({
  vite: {
    resolve: {
      // Supabase only loads this module in Node runtimes that lack global fetch.
      // Browsers always have fetch, so this keeps a partially installed legacy
      // dependency tree from breaking the client bundle.
      alias: {
        '@supabase/node-fetch': fileURLToPath(new URL('./src/lib/node-fetch-browser.ts', import.meta.url)),
      },
    },
  },
});
