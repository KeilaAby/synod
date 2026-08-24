import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
    coverage: {
      provider: 'v8',
      // ENF-MNT-03 : la couverture est mesuree sur la LOGIQUE METIER.
      // Couvrir les composants de presentation gonflerait le chiffre sans
      // rien garantir des regles de gestion.
      include: ['lib/domain/**', 'lib/utils/**', 'lib/validation/**'],
      thresholds: { statements: 70, branches: 70, functions: 70, lines: 70 },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
      'server-only': path.resolve(import.meta.dirname, 'tests/mocks/server-only.ts'),
    },
  },
});
