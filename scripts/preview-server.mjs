/* The Astro server the Playwright guards run against, spawned as a DIRECT child.
   `spawn('npx', …, { shell: true })` makes the child cmd.exe on Windows, so `server.kill()` kills the
   shell and leaves the node grandchild alive, still holding the port. They pile up: 101 of them ate
   the machine's whole commit charge and no build could run any more. Astro's entry run under this
   same node has no wrapper to lose, so kill() actually kills the server. */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const ASTRO = resolve('node_modules/astro/astro.js');

const answers = async (base) => {
	try { await fetch(base, { signal: AbortSignal.timeout(1500) }); return true; } catch { return false; }
};

export async function startServer(port, { mode = 'preview', tries = 200 } = {}) {
	const base = `http://localhost:${port}`;
	/* A squatted port answers fetch perfectly well, and the guard then shoots SOMEONE ELSE'S build —
	   which surfaces as a selector timing out on markup that is actually fine. Refuse the port. */
	if (await answers(base)) throw new Error(`port ${port} already answers: another server is squatting it`);
	const proc = spawn(process.execPath, [ASTRO, mode, '--port', String(port)], { cwd: resolve('.'), stdio: 'ignore' });
	for (let i = 0; i < tries; i++) {
		if (await answers(base)) return { base, stop: () => proc.kill() };
		await new Promise((r) => setTimeout(r, 300));
	}
	proc.kill();
	throw new Error(`no server on ${port} after ${tries} tries`);
}
