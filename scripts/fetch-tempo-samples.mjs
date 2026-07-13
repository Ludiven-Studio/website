/*
 * Vendor real-instrument samples for the Tempo game from gleitz/midi-js-soundfonts
 * (FluidR3_GM rendered as one mp3 per note, MIT license).
 *   → public/assets/jeux/tempo/samples/<voice>/<Note>.mp3 + manifest.json + LICENSE.txt
 * This matrix is the single source of truth; the runtime sampler reads manifest.json.
 *
 * Usage: node scripts/fetch-tempo-samples.mjs   (idempotent: skips existing files)
 */
import { resolve, join } from 'node:path';
import { mkdir, writeFile, stat, readdir } from 'node:fs/promises';

const REPO = 'https://gleitz.github.io/midi-js-soundfonts';
const OUT = resolve('public/assets/jeux/tempo/samples');

// Every 3 semitones over each voice's used register (repitch ≤ 1.5 st at runtime).
// `sf` = soundfont: MusyngKite is warmer/richer (used for the exposed piano, whose
// FluidR3 version was as bright as a nylon guitar); FluidR3_GM for the rest.
const range = (from, to) => Array.from({ length: Math.floor((to - from) / 3) + 1 }, (_, i) => from + i * 3);
const VOICES = [
	{ voice: 'piano', sf: 'MusyngKite', gm: 'acoustic_grand_piano', midis: range(40, 79) },
	{ voice: 'flute', sf: 'FluidR3_GM', gm: 'flute', midis: range(49, 79) },
	{ voice: 'reed', sf: 'FluidR3_GM', gm: 'oboe', midis: range(43, 82) },
	{ voice: 'gtr', sf: 'FluidR3_GM', gm: 'acoustic_guitar_nylon', midis: range(50, 86) },
	{ voice: 'bassGtr', sf: 'FluidR3_GM', gm: 'electric_bass_finger', midis: range(38, 71) },
	{ voice: 'brass', sf: 'FluidR3_GM', gm: 'french_horn', midis: range(38, 71) },
	{ voice: 'strings', sf: 'FluidR3_GM', gm: 'string_ensemble_1', midis: range(53, 86) },
];

// MIDI.js flat spelling used by gleitz filenames (C4 = 60 → "C4.mp3").
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const noteName = (m) => FLAT[m % 12] + (Math.floor(m / 12) - 1);

const exists = (p) => stat(p).then(() => true, () => false);

async function fetchOne(url, dest) {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			await writeFile(dest, Buffer.from(await res.arrayBuffer()));
			return;
		} catch (e) {
			if (attempt === 1) throw new Error(`${url}: ${e.message}`);
		}
	}
}

const jobs = [];
for (const { voice, sf, gm, midis } of VOICES) {
	await mkdir(join(OUT, voice), { recursive: true });
	for (const m of midis) jobs.push({ url: `${REPO}/${sf}/${gm}-mp3/${noteName(m)}.mp3`, dest: join(OUT, voice, `${noteName(m)}.mp3`) });
}

let done = 0, skipped = 0;
const failures = [];
// Concurrency 4
const queue = [...jobs];
await Promise.all(Array.from({ length: 4 }, async () => {
	for (let job = queue.shift(); job; job = queue.shift()) {
		if (await exists(job.dest)) { skipped++; continue; }
		try {
			await fetchOne(job.url, job.dest);
			done++;
		} catch (e) {
			failures.push(e.message);
		}
	}
}));
if (failures.length) {
	console.error(`FAILED (${failures.length}):\n` + failures.join('\n'));
	process.exit(1);
}

const manifest = Object.fromEntries(VOICES.map(({ voice, midis }) => [voice, midis]));
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, '\t') + '\n');
await writeFile(join(OUT, 'LICENSE.txt'), `Samples from midi-js-soundfonts (https://github.com/gleitz/midi-js-soundfonts)
Soundfonts: FluidR3_GM (Frank Wen) and MusyngKite, rendered per-note as mp3 by
Benjamin Gleitzman. Per-voice soundfont is defined in scripts/fetch-tempo-samples.mjs.
License: MIT (per the midi-js-soundfonts repository).
`);
await writeFile(join(OUT, 'README.md'), `# Tempo instrument samples

Per-note mp3 samples vendored from [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)
(FluidR3_GM, MIT). Regenerate / extend with:

\`\`\`
node scripts/fetch-tempo-samples.mjs
\`\`\`

The voice → GM instrument → MIDI-list matrix lives in that script; \`manifest.json\`
is what the runtime sampler (\`src/games/tempo/sampler.ts\`) reads.
`);

// Size report per voice
let total = 0;
for (const { voice } of VOICES) {
	let bytes = 0;
	for (const f of await readdir(join(OUT, voice))) bytes += (await stat(join(OUT, voice, f))).size;
	total += bytes;
	console.log(`${voice.padEnd(8)} ${(bytes / 1024).toFixed(0).padStart(5)} KB`);
}
console.log(`total    ${(total / 1024 / 1024).toFixed(2)} MB — downloaded ${done}, skipped ${skipped}`);
