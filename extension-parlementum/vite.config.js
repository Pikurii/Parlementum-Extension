import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                content: resolve(__dirname, 'src/main.js'),
            },
            output: {
                // Single bundled file — Chrome loads it as content script
                entryFileNames: '[name].js',
                chunkFileNames: '[name].js',
                assetFileNames: '[name].[ext]',
                format: 'iife', // IIFE so no import() at runtime
                name: 'ParlementumAW'
            }
        },
        sourcemap: 'inline', // Useful for debugging in DevTools
        target: 'chrome114',
        minify: false, // Readable output for debugging; set true for production
    }
});
