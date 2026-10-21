import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { BRAND, TAB_TITLE } from './shared/brand.js';

// Fills the brand name and logo into index.html (tab title and favicon); a fixed TAB_TITLE
// (shared/brand.js) is also the title shown while the page loads.
const brandHtml = {
  name: 'brand-html',
  // 'pre': run before Vite rewrites the placeholder href as a URL (dev server otherwise gets '//…').
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => {
      const out = html.replaceAll('__BRAND_NAME__', BRAND.name).replaceAll('__BRAND_LOGO__', BRAND.logo);
      return TAB_TITLE ? out.replace(/<title>[\s\S]*?<\/title>/, `<title>${TAB_TITLE.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>`) : out;
    },
  },
};

export default defineConfig({
  root: 'client',
  plugins: [react(), brandHtml],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' }, fs: { allow: ['..'] } },
});
