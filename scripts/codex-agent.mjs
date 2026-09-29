/* Run Codex as a sub-agent on one .collab ticket, headless (`codex exec`).
   Claude Code orchestrates: it opens the ticket, runs this, reads the answer, closes the ticket.
   The user no longer relays between the two agents.

   - review / idea / question tickets: read-only sandbox. Codex writes no file; its final message is
     appended to the ticket's "## Réponse" section by this script.
   - image tickets: workspace-write sandbox, and the prompt restricts writes to the ticket's `files:`
     (the .collab/out/<id>/ drop zone).
   Status goes open → in-progress → answered (or back to open on failure). Full event log in
   D:/tmp/codex-runs/.

   Usage: node scripts/codex-agent.mjs <ticket id> [--timeout <min>] [--model <name>] */
import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const id = args.find((a) => /^\d{1,4}$/.test(a));
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (!id) {
	console.error('usage: node scripts/codex-agent.mjs <ticket id> [--timeout <min>] [--model <name>]');
	process.exit(2);
}
const TIMEOUT_MIN = Number(opt('--timeout') ?? 20);
const ROOT = resolve('.');
const TICKETS = join(ROOT, '.collab', 'tickets');
const LOGS = 'D:/tmp/codex-runs';

// The desktop app ships its CLI under a hashed folder that changes on update: take the newest.
async function codexBin() {
	if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
	const base = join(process.env.LOCALAPPDATA ?? '', 'OpenAI', 'Codex', 'bin');
	if (existsSync(base)) {
		let best = null, bestT = 0;
		for (const d of await readdir(base)) {
			const exe = join(base, d, 'codex.exe');
			if (!existsSync(exe)) continue;
			const t = (await stat(exe)).mtimeMs;
			if (t > bestT) { bestT = t; best = exe; }
		}
		if (best) return best;
	}
	return 'codex';
}

const file = (await readdir(TICKETS)).find((f) => f.startsWith(id.padStart(4, '0') + '-'));
if (!file) { console.error(`no ticket ${id} in ${TICKETS}`); process.exit(2); }
const path = join(TICKETS, file);
let text = await readFile(path, 'utf8');
const field = (k) => text.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
const setStatus = (s) => { text = text.replace(/^status:\s*.*$/m, `status: ${s}`); return writeFile(path, text); };

if (field('to') !== 'codex') { console.error(`ticket ${file} is addressed to "${field('to')}", not codex`); process.exit(2); }
if (!['open', 'in-progress'].includes(field('status'))) { console.error(`ticket ${file} is "${field('status')}"`); process.exit(2); }
const type = field('type');
const files = field('files');
const write = type === 'image';

const prompt = `Tu es Codex, sous-agent de Claude Code (orchestrateur) dans ce dépôt. L'utilisateur n'est pas là : ne pose pas de question, fais au mieux et signale les limites.

Lis .collab/README.md, puis traite le ticket .collab/tickets/${file}.
Règles de cette exécution :
- ${write
		? `Tu peux créer ou modifier des fichiers UNIQUEMENT dans : ${files}. Crée le dossier si besoin. Rien d'autre, ni le ticket ni ton journal. La copie que ton outil d'images garde d'office dans ~/.codex/generated_images/ est autorisée : ce n'est pas une écriture dans le dépôt.`
		: 'Bac à sable en lecture seule : ne tente aucune écriture.'}
- Aucune commande git qui modifie l'état (add, commit, stash, checkout, reset…).
- Ta réponse finale est recopiée telle quelle dans la section « ## Réponse » du ticket : écris-la en français,
  en Markdown, directement utilisable (pas de préambule du type « Voici ma réponse »).
${write ? '- Termine par la liste exacte des fichiers écrits, avec leurs dimensions.' : ''}`;

await mkdir(LOGS, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = join(LOGS, `${id}-${stamp}.md`);
const log = join(LOGS, `${id}-${stamp}.jsonl`);
const bin = await codexBin();
const cli = ['exec', '-s', write ? 'workspace-write' : 'read-only', '--color', 'never', '--json', '-C', ROOT, '-o', out];
if (opt('--model')) cli.push('-m', opt('--model'));
cli.push('-');

await setStatus('in-progress');
console.log(`codex ${type} ticket ${file} (${write ? 'workspace-write' : 'read-only'}) → ${log}`);
const code = await new Promise((done) => {
	const p = spawn(bin, cli, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
	const chunks = [];
	p.stdout.on('data', (d) => chunks.push(d));
	p.stderr.on('data', (d) => chunks.push(d));
	p.stdin.end(prompt);
	const timer = setTimeout(() => { console.error(`timeout after ${TIMEOUT_MIN} min`); p.kill(); }, TIMEOUT_MIN * 60_000);
	p.on('close', async (c) => {
		clearTimeout(timer);
		await writeFile(log, Buffer.concat(chunks));
		done(c ?? 1);
	});
});

const answer = existsSync(out) ? (await readFile(out, 'utf8')).trim() : '';
text = await readFile(path, 'utf8'); // Codex may not touch it, but never clobber a concurrent edit.
if (code !== 0 || !answer) {
	await setStatus('open');
	console.error(`codex failed (exit ${code}), ticket back to open. See ${log}`);
	process.exit(1);
}
const day = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 16);
const block = `\n### Codex — ${day} (via codex-agent.mjs)\n\n${answer}\n`;
text = text.replace(/## Réponse\n/, `## Réponse\n${block}`);
await setStatus('answered');
console.log(answer);
