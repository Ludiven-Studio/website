# stats-admin: first deploy

Needs Raphaël's word (server and production database). Run from the website folder, in PowerShell.
`$s = "$env:LOCALAPPDATA\supabase-cli\supabase.exe"`, project `mzrdfahmzllgbpudpsdi`.

1. **Umami** (https://stats.ludiven-studio.fr, in the browser, as admin):
   - Settings → Users → Create user: `dashboard`, a long random password, role **View only**.
   - Settings → Teams: add `dashboard` to the team that holds the apps' websites (or create one and move them in).
   - Settings → About: note the version. Retention needs v2.10 or later; below, J1/J7 show « – ».
2. **Secrets** (PROMO_ADMIN_USER_ID is already set for promo-admin):
   ```
   & $s secrets set --project-ref mzrdfahmzllgbpudpsdi UMAMI_URL=https://stats.ludiven-studio.fr UMAMI_USER=dashboard
   & $s secrets set --project-ref mzrdfahmzllgbpudpsdi UMAMI_PASSWORD=<the password>
   ```
3. **Table** `admin_stats_cache` (migration 20261120160000):
   ```
   & $s migration list --project-ref mzrdfahmzllgbpudpsdi
   & $s db push --project-ref mzrdfahmzllgbpudpsdi --dry-run
   ```
   The dry run must list `20261120160000_admin_stats_cache.sql` only; then the same line without `--dry-run`.
4. **Function**:
   ```
   & $s functions deploy stats-admin --project-ref mzrdfahmzllgbpudpsdi
   ```
5. **Check**: open https://www.ludiven-studio.fr/admin/stats/ signed in with Raphaël's Google account. Each app's
   « Non lus » line names the Umami calls that failed, if any.

promo-admin's check of `weights` per platform (2026-11-20) also waits for a redeploy:
`& $s functions deploy promo-admin --project-ref mzrdfahmzllgbpudpsdi`.
