// Copies the Rapier physics engine (Mölkky) into public/vendor under a versioned name.
//
// It is 4.3 MB with its WASM inlined, so it cannot sit in a hashed chunk: the PWA precache caps a
// file at 2 MB, and a precached chunk that imports a non-precached, hashed one 404s after the next
// deploy (scripts/check-precache.mjs, rule B). A versioned URL never changes under a page, and the
// Mölkky page loads it on demand; physics.ts carries the same version and a test checks the match.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const PKG = 'node_modules/@dimforge/rapier3d-deterministic-compat';
const OUT = 'public/vendor';
const { version } = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
const name = `rapier3d-det-${version}.mjs`;

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (/^rapier3d-det-.*\.mjs$/.test(f) && f !== name) unlinkSync(join(OUT, f));
copyFileSync(join(PKG, 'dist/rapier.mjs'), join(OUT, name));
console.log(`vendor: ${OUT}/${name}`);
