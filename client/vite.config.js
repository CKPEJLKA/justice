import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // слушать на всех интерфейсах, чтобы сайт был доступен по локальной сети
    // В dev-режиме относительные /api проксируются на бэкенд (порт 3001),
    // поэтому фронтенд и API для браузера выглядят как один origin.
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
