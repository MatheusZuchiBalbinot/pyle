import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
	plugins: [react()],
	resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
	// Pre-bundle the heavy dependencies up front instead of discovering them
	// lazily on the first request — lazy discovery is what makes the first
	// page load after `npm run dev` crawl and triggers a full reload
	// mid-session when a new dep shows up ("new dependencies optimized").
	optimizeDeps: {
		include: ['react', 'react-dom', 'react-dom/client', 'react-i18next', 'i18next', 'lucide-react'],
	},
	server: {
		// Transform the app entry graph while the server is idle, so the first
		// browser request is served from cache instead of compiled on demand.
		warmup: {
			clientFiles: ['./src/main.tsx', './src/app/shell/Dashboard/Dashboard.tsx'],
		},
	},
});
