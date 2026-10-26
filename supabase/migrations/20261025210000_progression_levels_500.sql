-- Dragon's Gems Swipe (eclats): five worlds of fifty levels, 1-250, and 251-500 with the Expert pack.
alter table public.game_progress
	drop constraint if exists game_progress_level_check;

alter table public.game_progress
	add constraint game_progress_level_check check (level between 1 and 500);
