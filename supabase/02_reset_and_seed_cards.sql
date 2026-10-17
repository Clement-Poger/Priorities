-- Run after 01_schema.sql.
-- This replaces the whole card deck and clears round-dependent game progress.
-- Existing players and game records are preserved; unfinished games return to the lobby.

begin;

delete from public.rounds;

update public.games
set status = 'LOBBY',
    round_number = 1
where status <> 'FINISHED';

update public.players set score = 0;

delete from public.cards;

insert into public.cards (content, category) values
  ('La famille', 'Relations'),
  ('Les amis', 'Relations'),
  ('L’amour', 'Relations'),
  ('La santé', 'Bien-être'),
  ('La liberté', 'Valeurs'),
  ('La sécurité financière', 'Valeurs'),
  ('La réussite professionnelle', 'Valeurs'),
  ('Le temps libre', 'Quotidien'),
  ('Voyager et découvrir le monde', 'Expériences'),
  ('Apprendre de nouvelles choses', 'Développement'),
  ('Créer et exprimer ses idées', 'Développement'),
  ('Aider les autres', 'Relations'),
  ('Être reconnu pour ses efforts', 'Valeurs'),
  ('Vivre des aventures', 'Expériences'),
  ('Profiter de la nature', 'Quotidien'),
  ('Avoir une vie stable', 'Valeurs'),
  ('Rire et s’amuser', 'Quotidien'),
  ('Défendre la justice', 'Valeurs'),
  ('Protéger l’environnement', 'Valeurs'),
  ('Se sentir indépendant', 'Valeurs'),
  ('Transmettre son expérience', 'Relations'),
  ('Découvrir de nouvelles cultures', 'Expériences'),
  ('Avoir un travail qui a du sens', 'Valeurs'),
  ('Vivre dans un environnement paisible', 'Quotidien'),
  ('Prendre soin de soi', 'Bien-être'),
  ('Partager des moments avec ses proches', 'Relations'),
  ('Relever des défis', 'Expériences'),
  ('Avoir du confort au quotidien', 'Quotidien'),
  ('Développer sa confiance en soi', 'Développement'),
  ('Contribuer à une cause importante', 'Valeurs');

commit;
