// eslint-config-next 16 already exports a flat config, so no FlatCompat here.
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  {
    // Generated output (Next build, OpenNext Worker, caches, reports).
    ignores: [
      '.next/**',
      '.open-next/**',
      '.wrangler/**',
      '.cache/**',
      '.lighthouseci/**',
      'node_modules/**',
      'out/**',
      'next-env.d.ts',
    ],
  },
  ...coreWebVitals,
  ...nextTypeScript,
];

export default eslintConfig;
