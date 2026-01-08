import { defineConfig } from 'vite';
import { resolve } from 'path';

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
