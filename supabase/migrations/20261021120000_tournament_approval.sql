-- FFPJP approval (agrément) of a tournament, two separate facts:
-- approval_declared: the organizer's own answer (true / false / null = does not know).
-- approval_source: set only from a checked source (committee calendar, moderator),
-- never by the organizer. Non-null = verified approved.
alter table public.meetup_tournaments add column if not exists approval_declared boolean;
alter table public.meetup_tournaments add column if not exists approval_source text
	check (approval_source is null or char_length(approval_source) between 2 and 80);

-- Committee imports wrote their source at the end of the details: "... calendrier du
-- comité de l’Isère." Only trusted for what the import account published, or what a
-- club took over from it by an approved claim: any organizer can type that sentence.
update public.meetup_tournaments t
set approval_source = 'Calendrier du comité ' || substring(t.details from 'calendrier du comité (.+?)\.')
where t.approval_source is null
	and t.details ~ 'calendrier du comité .+\.'
	and (
		t.organizer_id in (select id from auth.users where lower(email) = 'petanquemeet.admin@ludiven-studio.fr')
		or exists (
			select 1 from public.meetup_tournament_claims c
			join auth.users u on u.id = c.from_organizer
			where c.status = 'approved' and lower(u.email) = 'petanquemeet.admin@ludiven-studio.fr'
				and c.player_id = t.organizer_id and c.club_name = t.club_name
		)
	);
