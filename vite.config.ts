/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Groups match in order; specific groups first, catch-alls later.
          groups: [
            { name: 'firebase-auth', test: /@firebase[\\/]auth[\\/]/ },
            { name: 'firebase-firestore', test: /@firebase[\\/]firestore[\\/]/ },
            { name: 'firebase', test: /node_modules[\\/](firebase|@firebase)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
