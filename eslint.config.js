import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import astro from 'eslint-plugin-astro';

// Minimal flat config: correctness-focused. react-hooks catches the stale-deps /
// rules-of-hooks bugs (e.g. RAF loops); style nits stay warnings so CI stays green.
export default tseslint.config(
	{
		ignores: ['dist/', '.astro/', 'node_modules/', 'public/', 'scripts/', '**/*.config.*', 'src/env.d.ts'],
	},
	{
		files: ['**/*.{ts,tsx}'],
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		plugins: { 'react-hooks': reactHooks },
		rules: {
			...reactHooks.configs.recommended.rules,
			'no-empty': ['error', { allowEmptyCatch: true }],
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
			],
			// Vendor-prefixed browser APIs (fullscreen, audio) still need `any` here and there.
			'@typescript-eslint/no-explicit-any': 'warn',
		},
	},
	...astro.configs.recommended,
	{
		files: ['**/*.astro'],
		plugins: { '@typescript-eslint': tseslint.plugin },
		rules: { '@typescript-eslint/no-explicit-any': 'warn' },
	},
);
