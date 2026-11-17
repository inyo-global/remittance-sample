import { defineConfig } from 'vitest/config';

// Two projects: the React app runs under happy-dom, the Express BFF under plain Node.
export default defineConfig({
  test: {
    projects: [
      {
        extends: './vite.config.js',
        test: {
          name: 'client',
          environment: 'happy-dom',
          include: ['src/**/*.test.{js,jsx}'],
          setupFiles: ['./test/client/setup.js'],
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['test/server/**/*.test.js'],
          setupFiles: ['./test/server/setup.js'],
        },
      },
    ],
  },
});
