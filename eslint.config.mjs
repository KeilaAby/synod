import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Garde-fous automatises — plan.md §18.2.
 *
 * Les regles « non negociables » du plan ne tiennent que si une machine les
 * verifie. Une convention qui repose sur la vigilance humaine s'erode au
 * troisieme sprint.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'coverage/**',
    // Composants generes par la CLI shadcn : on en est proprietaire, mais on
    // ne leur impose pas nos conventions de nommage francaises.
    'components/ui/**',
  ]),

  {
    rules: {
      // ---------------------------------------------------------------------
      // Regle n°10 — ENF-POR-02/03 : le SDK de l'hebergeur ne doit JAMAIS
      // fuiter hors des adaptateurs. C'est ce qui rend la reversibilite
      // (ARB-8, CA-16) verifiable plutot que declarative.
      // ---------------------------------------------------------------------
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              message:
                "ENF-POR-02/03 : n'importez le SDK de l'hebergeur que dans lib/supabase, " +
                'lib/auth ou lib/storage. Ailleurs, passez par auth() ou storage().',
            },
            {
              name: '@supabase/ssr',
              message:
                "ENF-POR-02/03 : n'importez le SDK de l'hebergeur que dans lib/supabase, " +
                'lib/auth ou lib/storage.',
            },
          ],
        },
      ],

      // ---------------------------------------------------------------------
      // Regle n°6 — UI-01 : grille de 8px.
      // Interdit les valeurs arbitraires d'espacement (p-[13px], gap-[5px]...)
      // qui contournent l'echelle Tailwind.
      // ---------------------------------------------------------------------
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/(^|\\s)-?(p|m|gap|space)[xytrbl]?-\\[/]',
          message:
            'UI-01 : espacement hors de la grille de 8px. Utilisez l echelle Tailwind ' +
            '(p-2 = 8px, p-4 = 16px, p-6 = 24px, p-8 = 32px).',
        },
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message:
            'ENF-SEC-04 : aucun rendu HTML brut. Les chaines utilisateur passent par ' +
            'sanitize() et sont rendues en texte.',
        },
      ],

      // ENF-MNT-01 — TypeScript strict : aucun echappement silencieux.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // ENF-UTI-03 — accessibilite
      'jsx-a11y/alt-text': 'error',
    },
  },

  // Les adaptateurs SONT le point de contact avec l'hebergeur : l'interdiction
  // d'import n'y a pas lieu d'etre.
  {
    files: ['lib/supabase/**', 'lib/auth/**', 'lib/storage/**'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // Les tests manipulent des donnees fabriquees : les contraintes de typage
  // strict y sont assouplies, pas celles de securite.
  {
    files: ['tests/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
]);

export default eslintConfig;
