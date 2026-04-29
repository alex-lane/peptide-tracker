import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/math/**/*.ts', 'src/scheduling/**/*.ts', 'src/inventory/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      thresholds: {
        // Per autoplan eng review: branch coverage > line coverage on math/scheduling.
        branches: 90,
        statements: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
