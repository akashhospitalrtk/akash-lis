import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && process.env.VERCEL === '1') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const address = process.env.VITE_API_URL || env.VITE_API_URL;
    let valid = false;
    try {
      const url = new URL(address || '');
      valid = url.protocol === 'https:' && url.pathname === '/api' && !url.username && !url.password && !url.search && !url.hash;
    } catch { /* Report configuration errors without logging the supplied value. */ }
    if (!valid) throw new Error('Set VITE_API_URL in this Vercel frontend project to the HTTPS backend URL ending in /api (no trailing slash), then redeploy.');
  }
  return { plugins: [react()] };
});
