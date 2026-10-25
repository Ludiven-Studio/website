-- Dragon's Gems Swipe (ex-Éclats): the daily challenge starts over with the new version. Every
-- day's scores go, in game_scores and in the legacy `scores` table the bridge still feeds. The
-- level progression (game_progress) stays.

delete from public.game_scores where game_id in ('eclats', 'eclats-t');
delete from public.scores where game in ('eclats', 'eclats-t');

update public.games set name = 'Dragon''s Gems Swipe' where id in ('eclats', 'eclats-t');
