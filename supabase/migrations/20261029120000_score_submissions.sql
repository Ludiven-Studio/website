-- submit-score answers a retried run with its first answer: an app that lost the reply sends the same
-- submission_id again, and the run must not be inserted twice nor counted as another daily attempt.
-- Only the function touches it (RLS on, no policy).

create table if not exists public.score_submissions (
	player_id uuid not null,
	submission_id uuid not null,
	response jsonb not null,
	created_at timestamptz not null default now(),
	primary key (player_id, submission_id)
);

alter table public.score_submissions enable row level security;
