import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // fixtures/candy-swap is Kiro's output, committed as is (D-10, D-37): never linted or hand-edited.
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '.superpowers/**', 'fixtures/candy-swap/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
