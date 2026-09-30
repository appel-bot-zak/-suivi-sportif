-- ============================================================
-- Suivi by Zåk — volet social v2 (fil d'activité, profil enrichi, coucou)
-- À coller dans l'éditeur SQL de Supabase (SQL Editor → New query → Run),
-- APRÈS supabase_social_schema.sql (v1). Ré-exécutable sans risque
-- (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / drop policy if exists).
--
-- Ce que ça ajoute : mur de badges complet, série hebdo et tendance de
-- volume (en mots, jamais un chiffre) sur le profil ami ; un fil
-- d'activité (séance/badge/record/niveau, jamais charge/reps) ; des
-- "coucous" liés à un événement précis. Voir roadmap-social-v2.md.
-- ============================================================

-- ---------- profil enrichi : colonnes ajoutées à session_summaries ----------
alter table session_summaries add column if not exists all_badges jsonb not null default '[]'::jsonb; -- tous les badges débloqués (pas que les 3-4 récents)
alter table session_summaries add column if not exists serie_hebdo int not null default 0; -- semaines d'affilée en cours
alter table session_summaries add column if not exists tendance_volume text not null default 'stable'
  check (tendance_volume in ('hausse','stable','pause'));

-- ---------- fil d'activité ----------
create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('session','badge','record','levelup')),
  payload jsonb not null default '{}'::jsonb, -- {duree} | {nom} | {exercice} | {niveau} — jamais de charge/reps
  created_at timestamptz not null default now()
);
create index if not exists activity_events_user_created_idx on activity_events(user_id, created_at desc);

alter table activity_events enable row level security;

drop policy if exists "events_select_self" on activity_events;
create policy "events_select_self" on activity_events
  for select using (auth.uid() = user_id);

drop policy if exists "events_select_friend" on activity_events;
create policy "events_select_friend" on activity_events
  for select using (
    exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = activity_events.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = activity_events.user_id))
    )
  );

drop policy if exists "events_insert_self" on activity_events;
create policy "events_insert_self" on activity_events
  for insert with check (auth.uid() = user_id);

-- ---------- coucous (une seule réaction par événement) ----------
create table if not exists waves (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  event_id uuid not null references activity_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  seen boolean not null default false,
  constraint waves_no_self check (sender_id <> recipient_id),
  constraint waves_unique unique (sender_id, event_id) -- un seul coucou par événement
);
create index if not exists waves_recipient_idx on waves(recipient_id, seen);

alter table waves enable row level security;

drop policy if exists "waves_select_mine" on waves;
create policy "waves_select_mine" on waves
  for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "waves_insert_as_sender" on waves;
create policy "waves_insert_as_sender" on waves
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = waves.recipient_id)
          or (f.addressee_id = auth.uid() and f.requester_id = waves.recipient_id))
    )
  );

drop policy if exists "waves_update_recipient_seen" on waves;
create policy "waves_update_recipient_seen" on waves
  for update using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);
