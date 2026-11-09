-- Dragon Gems' all-time boards (endless 'eclats-inf', summit 'eclats-sommet') keep one row per player: the best,
-- like the daily challenge. Until now submit-score added a row per run there, and the app listed a player once per run.
-- The pétanque event boards keep every run: the site ranks each pseudo's best itself.
-- Run it after deploying the submit-score that reads games.free_play_best: the old one appends, and on these boards
-- the unique index below would refuse its rows.

-- 1) The rule, per game.
alter table public.games
	add column if not exists free_play_best boolean not null default false;
update public.games set free_play_best = true where id in ('eclats-inf', 'eclats-sommet');

-- 2) A copy of the whole table before anything is deleted. Closed to the clients: no policy, no grant.
create table public.game_scores_backup_20261110 as table public.game_scores;
alter table public.game_scores_backup_20261110 enable row level security;
revoke all on table public.game_scores_backup_20261110 from anon, authenticated;

-- 3) Each player's runs on those boards become one row: the best score, the oldest run on a tie.
--    attempts then counts the player's runs there.
with ranked as (
	select s.id,
		row_number() over (
			partition by s.game_id, s.player_id
			order by case when g.metric = 'time' then s.score else -s.score end, s.created_at, s.id
		) as rn,
		sum(s.attempts) over (partition by s.game_id, s.player_id) as runs
	from public.game_scores s
	join public.games g on g.id = s.game_id
	where s.challenge_date is null and g.free_play_best
),
counted as (
	update public.game_scores s set attempts = r.runs
	from ranked r
	where s.id = r.id and r.rn = 1 and s.attempts <> r.runs
)
delete from public.game_scores s
using ranked r
where s.id = r.id and r.rn > 1;

-- 4) One row per player on those boards from now on. An index predicate cannot read `games`: a game given
--    free_play_best later needs its id here too.
create unique index if not exists game_scores_free_best_uniq
	on public.game_scores (game_id, player_id)
	where challenge_date is null and game_id in ('eclats-inf', 'eclats-sommet');

-- 5) The counts, and a check that nothing else moved: the whole migration rolls back otherwise.
do $$
declare
	b record;
	other_before bigint;
	other_after bigint;
begin
	for b in
		select k.game_id, count(*) as rows_before, sum(k.attempts) as runs_before, count(distinct k.player_id) as players,
			(select count(*) from public.game_scores s where s.game_id = k.game_id and s.challenge_date is null) as rows_after,
			(select coalesce(sum(s.attempts), 0) from public.game_scores s where s.game_id = k.game_id and s.challenge_date is null) as runs_after
		from public.game_scores_backup_20261110 k
		join public.games g on g.id = k.game_id
		where k.challenge_date is null and g.free_play_best
		group by k.game_id
	loop
		raise notice '%: % rows -> % rows, % players, % runs counted', b.game_id, b.rows_before, b.rows_after, b.players, b.runs_after;
		if b.rows_after <> b.players or b.runs_after <> b.runs_before then
			raise exception '%: % rows kept for % players, % runs counted for % before', b.game_id, b.rows_after, b.players, b.runs_after, b.runs_before;
		end if;
	end loop;

	select count(*) into other_before from public.game_scores_backup_20261110 k join public.games g on g.id = k.game_id
		where k.challenge_date is not null or not g.free_play_best;
	select count(*) into other_after from public.game_scores s join public.games g on g.id = s.game_id
		where s.challenge_date is not null or not g.free_play_best;
	raise notice 'other rows (dailies, other boards): % -> %', other_before, other_after;
	if other_before <> other_after then
		raise exception 'other rows changed: % -> %', other_before, other_after;
	end if;
end $$;
