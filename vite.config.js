import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                feed: resolve(__dirname, 'feed.html'),
                createPost: resolve(__dirname, 'create-post.html'),
                discussion: resolve(__dirname, 'discussion.html'),
            },
        },
    },
});
