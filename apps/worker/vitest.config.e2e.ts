import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      // Vite reserves BASE_URL; local storage needs an absolute HTTP URL.
      BASE_URL: process.env.BASE_URL || 'http://localhost:3010',
    },
  },
});
