-- ============================================================
-- Suivi by Zåk — volet social (amis + résumé de dernière séance)
-- À coller une seule fois dans l'éditeur SQL de Supabase (SQL Editor
-- → New query → Run). Peut être ré-exécuté sans risque (IF NOT EXISTS
-- + drop policy if exists).
--
-- Ce que ça stocke : pseudo, niveau, XP, noms des badges récents,
-- date + durée de la dernière séance. JAMAIS le détail (poids, séries,
-- reps, historique complet) — voir roadmap-social.md.
--
-- La clé "anon" utilisée par l'app est publique par design chez
-- Supabase : toute la sécurité vient des policies RLS ci-dessous
-- (un utilisateur ne peut lire que son propre profil/résumé, ou celui
-- d'un ami accepté — jamais une liste ou un profil au hasard).
-- ============================================================

-- ---------- tables (dans l'ordre des dépendances) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id),
  constraint friendships_unique unique (requester_id, addressee_id)
);

create table if not exists session_summaries (
  user_id uuid primary key references profiles(id) on delete cascade,
  niveau int not null,
  xp int not null,
  last_session_at timestamptz not null,
  last_session_duree int not null, -- minutes
  badges jsonb not null default '[]'::jsonb, -- noms des 3-4 badges les plus récents seulement
  updated_at timestamptz not null default now()
);

-- ---------- profils ----------
alter table profiles enable row level security;

drop policy if exists "profiles_select_self" on profiles;
create policy "profiles_select_self" on profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_select_friend" on profiles;
create policy "profiles_select_friend" on profiles
  for select using (
    exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = profiles.id)
          or (f.addressee_id = auth.uid() and f.requester_id = profiles.id))
    )
  );

drop policy if exists "profiles_insert_self" on profiles;
create policy "profiles_insert_self" on profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on profiles;
create policy "profiles_update_self" on profiles
  for update using (auth.uid() = id);

-- ---------- relations d'amitié ----------
alter table friendships enable row level security;

drop policy if exists "friendships_select_mine" on friendships;
create policy "friendships_select_mine" on friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friendships_insert_as_requester" on friendships;
create policy "friendships_insert_as_requester" on friendships
  for insert with check (auth.uid() = requester_id);

drop policy if exists "friendships_update_accept" on friendships;
create policy "friendships_update_accept" on friendships
  for update using (auth.uid() = addressee_id)
  with check (status = 'accepted');

drop policy if exists "friendships_delete_either_side" on friendships;
create policy "friendships_delete_either_side" on friendships
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ---------- résumé de dernière séance (remplacé à chaque synchro) ----------
alter table session_summaries enable row level security;

drop policy if exists "summaries_select_self" on session_summaries;
create policy "summaries_select_self" on session_summaries
  for select using (auth.uid() = user_id);

drop policy if exists "summaries_select_friend" on session_summaries;
create policy "summaries_select_friend" on session_summaries
  for select using (
    exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = session_summaries.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = session_summaries.user_id))
    )
  );

drop policy if exists "summaries_insert_self" on session_summaries;
create policy "summaries_insert_self" on session_summaries
  for insert with check (auth.uid() = user_id);

drop policy if exists "summaries_update_self" on session_summaries;
create policy "summaries_update_self" on session_summaries
  for update using (auth.uid() = user_id);

-- ---------- recherche d'un profil par pseudo ou email ----------
-- Pas de liste publique d'utilisateurs : cette fonction ne renvoie
-- jamais qu'une correspondance EXACTE (insensible à la casse), jamais
-- un balayage/scan de la table, et jamais l'email de quelqu'un d'autre.
create or replace function search_profile(q text)
returns table(id uuid, pseudo text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.pseudo
  from profiles p
  left join auth.users u on u.id = p.id
  where lower(p.pseudo) = lower(trim(q))
     or lower(u.email) = lower(trim(q))
  limit 1;
$$;

revoke all on function search_profile(text) from public;
grant execute on function search_profile(text) to authenticated;
