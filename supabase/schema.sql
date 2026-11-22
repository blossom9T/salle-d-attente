-- ═════════════════════════════════════════════════════════════
--  Salle d'attente — base de données du classement (PostgreSQL / Supabase)
--
--  À exécuter une seule fois : Supabase → SQL Editor → New query → coller → Run.
--  Le script peut être relancé sans danger (il ne supprime aucune donnée).
--
--  Modèle :
--    jeux (1) ──< parties (1) ──< resultats >── (1) joueurs
--
--  Sécurité : le site n'a qu'une clé publique. Les tables sont donc en
--  lecture seule pour tout le monde (RLS), et la seule façon d'écrire
--  est la fonction enregistrer_partie(), qui vérifie les données.
-- ═════════════════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────────────────

create table if not exists public.jeux (
  id                  text primary key,
  nom                 text not null,
  plus_petit_meilleur boolean not null default false   -- vrai pour Réflexe (des millisecondes)
);

insert into public.jeux (id, nom, plus_petit_meilleur) values
  ('bombe',      'Bombe',            false),
  ('motmystere', 'Mot mystère',      false),
  ('morpion',    'Morpion',          false),
  ('reflexe',    'Réflexe',          true),
  ('calcul',     'Calcul éclair',    false),
  ('frappe',     'Course de frappe', false)
on conflict (id) do update
  set nom = excluded.nom, plus_petit_meilleur = excluded.plus_petit_meilleur;

create table if not exists public.joueurs (
  id       uuid primary key,                          -- généré par le navigateur du joueur
  pseudo   text not null check (char_length(pseudo) between 2 and 16),
  couleur  text not null default '#4F6470' check (couleur ~ '^#[0-9A-Fa-f]{6}$'),
  cree_le  timestamptz not null default now(),
  vu_le    timestamptz not null default now()
);

create table if not exists public.parties (
  id          uuid primary key default gen_random_uuid(),
  jeu         text not null references public.jeux (id),
  salon       text check (salon ~ '^[0-9]{4,6}$'),
  nb_joueurs  smallint not null check (nb_joueurs between 1 and 10),
  jouee_le    timestamptz not null default now()
);

create table if not exists public.resultats (
  partie_id  uuid not null references public.parties (id) on delete cascade,
  joueur_id  uuid not null references public.joueurs (id) on delete cascade,
  rang       smallint not null check (rang between 1 and 10),
  score      numeric not null,                        -- mots, points, ms… selon le jeu
  points     smallint not null default 0 check (points between 0 and 9),
  primary key (partie_id, joueur_id)
);

-- Numéros de salon : 6 chiffres (4 accepté pour les anciens salons).
alter table public.parties drop constraint if exists parties_salon_check;
alter table public.parties add constraint parties_salon_check check (salon ~ '^[0-9]{4,6}$');

create index if not exists resultats_joueur_idx on public.resultats (joueur_id);
create index if not exists parties_jeu_date_idx on public.parties (jeu, jouee_le desc);
create index if not exists parties_date_idx on public.parties (jouee_le desc);

-- ── Enregistrement d'une partie ──────────────────────────────
-- Appelée par l'hôte du salon à la fin de chaque partie :
--   select enregistrer_partie('bombe', '427193', '[{"pid":"…","pseudo":"Yanis","couleur":"#D9362B","rang":1,"score":12}, …]');
-- Points : 1 par adversaire battu (rien en solo, la partie compte pour les records).

create or replace function public.enregistrer_partie(p_jeu text, p_salon text, p_resultats jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partie uuid;
  v_nb     int;
  v_ligne  jsonb;
  v_rang   int;
begin
  if not exists (select 1 from jeux where id = p_jeu) then
    raise exception 'Jeu inconnu : %', p_jeu;
  end if;
  if jsonb_typeof(p_resultats) is distinct from 'array' then
    raise exception 'Les résultats doivent être une liste';
  end if;
  v_nb := jsonb_array_length(p_resultats);
  if v_nb < 1 or v_nb > 10 then
    raise exception 'Une partie compte de 1 à 10 joueurs';
  end if;
  if (select count(distinct x ->> 'pid') from jsonb_array_elements(p_resultats) x) <> v_nb then
    raise exception 'Un joueur apparaît deux fois';
  end if;
  -- Garde-fou contre le spam : une partie par salon toutes les 3 secondes au plus.
  if exists (select 1 from parties where salon = p_salon and jouee_le > now() - interval '3 seconds') then
    raise exception 'Partie déjà enregistrée pour ce salon il y a un instant';
  end if;

  insert into parties (jeu, salon, nb_joueurs)
  values (p_jeu, p_salon, v_nb)
  returning id into v_partie;

  for v_ligne in select * from jsonb_array_elements(p_resultats) loop
    v_rang := (v_ligne ->> 'rang')::int;
    if v_rang is null or v_rang < 1 or v_rang > v_nb then
      raise exception 'Rang invalide : %', v_ligne ->> 'rang';
    end if;

    insert into joueurs (id, pseudo, couleur)
    values (
      (v_ligne ->> 'pid')::uuid,
      left(btrim(v_ligne ->> 'pseudo'), 16),
      coalesce(nullif(v_ligne ->> 'couleur', ''), '#4F6470')
    )
    on conflict (id) do update
      set pseudo = excluded.pseudo, couleur = excluded.couleur, vu_le = now();

    insert into resultats (partie_id, joueur_id, rang, score)
    values (v_partie, (v_ligne ->> 'pid')::uuid, v_rang, coalesce((v_ligne ->> 'score')::numeric, 0));
  end loop;

  if v_nb > 1 then
    update resultats r
       set points = (select count(*) from resultats o where o.partie_id = v_partie and o.rang > r.rang)
     where r.partie_id = v_partie;
  end if;

  return v_partie;
end;
$$;

-- ── Vues lues par le site ────────────────────────────────────

create or replace view public.classement_general with (security_invoker = true) as
select
  j.id                                                          as joueur_id,
  j.pseudo,
  j.couleur,
  coalesce(sum(r.points), 0)::int                               as points,
  (count(*) filter (where r.rang = 1 and p.nb_joueurs > 1))::int as victoires,
  count(*)::int                                                 as parties,
  max(p.jouee_le)                                               as derniere_partie
from public.joueurs j
join public.resultats r on r.joueur_id = j.id
join public.parties p   on p.id = r.partie_id
group by j.id;

create or replace view public.classement_jeux with (security_invoker = true) as
select
  p.jeu,
  j.id                                                          as joueur_id,
  j.pseudo,
  j.couleur,
  coalesce(sum(r.points), 0)::int                               as points,
  (count(*) filter (where r.rang = 1 and p.nb_joueurs > 1))::int as victoires,
  count(*)::int                                                 as parties,
  case when g.plus_petit_meilleur then min(r.score) else max(r.score) end as record
from public.resultats r
join public.parties p on p.id = r.partie_id
join public.joueurs j on j.id = r.joueur_id
join public.jeux g    on g.id = p.jeu
group by p.jeu, g.plus_petit_meilleur, j.id;

create or replace view public.dernieres_parties with (security_invoker = true) as
select
  p.id,
  p.jeu,
  p.nb_joueurs,
  p.jouee_le,
  w.pseudo as gagnant,
  w.couleur,
  w.score
from public.parties p
cross join lateral (
  select j.pseudo, j.couleur, r.score
  from public.resultats r
  join public.joueurs j on j.id = r.joueur_id
  where r.partie_id = p.id
  order by r.rang, j.pseudo
  limit 1
) w
order by p.jouee_le desc;

-- ── Droits et sécurité (RLS) ─────────────────────────────────

alter table public.jeux      enable row level security;
alter table public.joueurs   enable row level security;
alter table public.parties   enable row level security;
alter table public.resultats enable row level security;

drop policy if exists "Lecture publique" on public.jeux;
drop policy if exists "Lecture publique" on public.joueurs;
drop policy if exists "Lecture publique" on public.parties;
drop policy if exists "Lecture publique" on public.resultats;
create policy "Lecture publique" on public.jeux      for select to anon, authenticated using (true);
create policy "Lecture publique" on public.joueurs   for select to anon, authenticated using (true);
create policy "Lecture publique" on public.parties   for select to anon, authenticated using (true);
create policy "Lecture publique" on public.resultats for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on public.jeux, public.joueurs, public.resultats to anon, authenticated;
-- Pour parties : pas de colonne « salon », pour que personne ne puisse lister les numéros de salon.
revoke select on public.parties from anon, authenticated;
grant select (id, jeu, nb_joueurs, jouee_le) on public.parties to anon, authenticated;
grant select on public.classement_general, public.classement_jeux, public.dernieres_parties to anon, authenticated;
revoke insert, update, delete, truncate on public.jeux, public.joueurs, public.parties, public.resultats from anon, authenticated;

revoke all on function public.enregistrer_partie(text, text, jsonb) from public;
grant execute on function public.enregistrer_partie(text, text, jsonb) to anon, authenticated;

-- ── Pour repartir de zéro (à lancer à la main si besoin) ─────
-- truncate public.resultats, public.parties, public.joueurs;
