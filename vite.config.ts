
import { URL, fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    return {
      server: {
        port: 3000,
        host: '0.-0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          // @ts-ignore
          '@': fileURLToPath(new URL('.', import.meta.url)),
        }
      }
    };
});