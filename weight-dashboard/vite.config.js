import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
	plugins: [react()],
	base: './', // Use relative paths for Electron compatibility
	server: {
		open: false // Don't open browser automatically - Electron will open instead
	},
	build: {
		outDir: 'dist',
		assetsDir: 'assets',
		// Ensure relative paths in built files
		rollupOptions: {
			output: {
				// Use relative paths for assets
				assetFileNames: 'assets/[name].[ext]',
				chunkFileNames: 'assets/[name]-[hash].js',
				entryFileNames: 'assets/[name]-[hash].js'
			}
		}
	}
})










