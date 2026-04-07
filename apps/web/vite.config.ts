import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@enrichment-saas/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: { port: 5173, proxy: { '/v1': 'http://localhost:3000' } },
});
