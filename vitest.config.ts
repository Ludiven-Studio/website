import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Used by Vitest only (Astro build uses astro.config.mjs). React plugin lets
// .tsx tests render game islands; non-JSX engine tests are unaffected.
export default defineConfig({
	plugins: [react()],
	test: {
		environment: 'node',
		// The engine tests are deterministic CPU work with no real waits: the timeout only stops a
		// runaway loop. At the 5 s default (and the 20-60 s limits some tests set), a loaded PC
		// (several Unity open) failed a different test each run.
		testTimeout: 120_000,
	},
});
