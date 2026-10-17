import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// https://vitejs.dev/config/
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, './src'),
    },
  },
  server: {
    host: true, // Permet l'accès depuis votre réseau local (téléphone)
    port: 5173,
  },
};