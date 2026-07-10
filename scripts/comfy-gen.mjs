/*
 * ComfyUI connector — drives the local ComfyUI HTTP API (127.0.0.1:8188) to
 * generate game key-art / backgrounds with SDXL Turbo, and saves the PNGs into
 * the repo. No MCP, no cloud: everything runs on the local GPU.
 *
 * Usage:  node scripts/comfy-gen.mjs [jobsFile.json]
 * Env:    COMFY_URL (default http://127.0.0.1:8188)
 *
 * A "job" = { id, prompt, negative?, w?, h?, steps?, seed?, out? }.
 * Default jobs (a small demo batch) live at the bottom of this file.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const COMFY = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const CKPT = 'sd_xl_turbo_1.0_fp16.safetensors';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// SDXL-Turbo txt2img graph in ComfyUI API format. Turbo → low steps, cfg 1.0.
function graph({ prompt, negative = '', w = 768, h = 512, steps = 5, seed }) {
	return {
		'4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
		'5': { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } },
		'6': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
		'7': { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['4', 1] } },
		'3': {
			class_type: 'KSampler',
			inputs: { seed, steps, cfg: 1.0, sampler_name: 'euler_ancestral', scheduler: 'normal', denoise: 1.0, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] },
		},
		'8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
		'9': { class_type: 'SaveImage', inputs: { filename_prefix: 'ludiven', images: ['8', 0] } },
	};
}

export async function submit(job) {
	const seed = job.seed ?? Math.floor(Math.random() * 2 ** 31);
	const res = await fetch(`${COMFY}/prompt`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ prompt: graph({ ...job, seed }) }),
	});
	if (!res.ok) throw new Error(`submit ${job.id}: ${res.status} ${await res.text()}`);
	return (await res.json()).prompt_id;
}

export async function waitForImages(promptId, timeoutMs = 120000) {
	const t0 = Date.now();
	for (;;) {
		const h = await (await fetch(`${COMFY}/history/${promptId}`)).json();
		const entry = h[promptId];
		if (entry?.outputs) {
			const imgs = Object.values(entry.outputs).flatMap((o) => o.images ?? []);
			if (imgs.length) return imgs;
		}
		if (entry?.status?.status_str === 'error') throw new Error(`ComfyUI error on ${promptId}`);
		if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${promptId}`);
		await sleep(500);
	}
}

export async function download(img, outPath) {
	const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'output' });
	const res = await fetch(`${COMFY}/view?${q}`);
	if (!res.ok) throw new Error(`download ${img.filename}: ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	await mkdir(dirname(outPath), { recursive: true });
	await writeFile(outPath, buf);
	return buf.length;
}

export async function run(jobs) {
	console.log(`ComfyUI @ ${COMFY} — ${jobs.length} job(s)`);
	for (const job of jobs) {
		const t0 = Date.now();
		const id = await submit(job);
		const imgs = await waitForImages(id);
		const out = resolve(job.out ?? `D:/tmp/comfy/${job.id}.png`);
		const bytes = await download(imgs[0], out);
		console.log(`  ✓ ${job.id}  (${((Date.now() - t0) / 1000).toFixed(1)}s, ${(bytes / 1024).toFixed(0)} KB) → ${out}`);
	}
	console.log('done.');
}

// ---- demo batch (validates the pipeline) ---------------------------------
const STYLE = 'flat vector game illustration, bold clean shapes, vibrant playful colors, soft gradients, subtle depth, modern casual mobile game key art, centered composition, no text';
const NEG = 'text, watermark, blurry, ugly, deformed, photo, realistic, 3d render, noisy';
const DEMO = [
	{ id: 'cocotte-hero', prompt: `a cute cartoon hen mascot (cocotte), cheerful, ${STYLE}`, negative: NEG },
	{ id: 'tempo-keyart', prompt: `music rhythm game, falling glowing piano tiles on lanes, musical notes, neon night, ${STYLE}`, negative: NEG },
];

// Run the demo batch only when invoked directly (not when imported as a module).
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
	const jobsArg = process.argv[2];
	const jobs = jobsArg ? JSON.parse(await (await import('node:fs/promises')).readFile(jobsArg, 'utf8')) : DEMO;
	await run(jobs);
}
