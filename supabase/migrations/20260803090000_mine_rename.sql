-- Display rename: "La Mine aux Cocottes" → "Cages de Cristal". The id stays 'mine'
-- so existing scores, levels and /jeux/mine links keep working.

update public.games set name = 'Cages de Cristal' where id = 'mine';
