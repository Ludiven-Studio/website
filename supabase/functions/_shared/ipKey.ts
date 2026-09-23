// Peppered SHA-256 of the caller's IP, for per-IP quotas.
//
// The pepper is what makes this not personal data: the whole IPv4 space hashes in minutes,
// so a bare digest is reversible. No pepper = null = no IP quota, rather than a false one.
//
// cf-connecting-ip first: Cloudflare sets it and overwrites any client value. The first
// x-forwarded-for entry is whatever the client sent, so it is only a fallback.

const IP_PEPPER = Deno.env.get('MEETUPS_IP_PEPPER') ?? '';

export const ipQuotaEnabled = (): boolean => Boolean(IP_PEPPER);

export function clientIp(req: Request): string {
	const cf = req.headers.get('cf-connecting-ip');
	if (cf) return cf.trim();
	return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
}

export async function ipKey(req: Request): Promise<string | null> {
	if (!IP_PEPPER) return null;
	const ip = clientIp(req);
	if (!ip) return null;
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${IP_PEPPER}:${ip}`));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
