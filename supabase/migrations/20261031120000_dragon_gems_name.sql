-- The game is now « Dragon Gems Swipe », without the apostrophe: the site's game, its daily board, the app's endless
-- mode and its summit challenge.

update public.games set name = 'Dragon Gems Swipe'
where id in ('eclats', 'eclats-t', 'eclats-inf', 'eclats-sommet');
