// eslint-config-next 16 já exporta flat config: nada de FlatCompat aqui.
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'out/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...nextTypeScript,
];

export default eslintConfig;
