import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@moss/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
      '@moss/domain': fileURLToPath(new URL('./packages/domain/src/index.ts', import.meta.url)),
      '@moss/application': fileURLToPath(new URL('./packages/application/src/index.ts', import.meta.url)),
      '@moss/client': fileURLToPath(new URL('./packages/client/src/index.ts', import.meta.url)),
      '@moss/local-db': fileURLToPath(new URL('./packages/local-db/src/index.ts', import.meta.url)),
      '@moss/sync-core': fileURLToPath(new URL('./packages/sync-core/src/index.ts', import.meta.url)),
      '@moss/test-fixtures': fileURLToPath(new URL('./packages/test-fixtures/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
