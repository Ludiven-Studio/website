import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Used by Vitest only (Astro build uses astro.config.mjs). React plugin lets
// .tsx tests render game islands; non-JSX engine tests are unaffected.
export default defineConfig({
	plugins: [react()],
	test: {
		environment: 'node',
	},
});
