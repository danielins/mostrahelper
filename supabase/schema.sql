create table public.mostra_boards (
  user_id uuid primary key references auth.users (id) on delete cascade,
  board jsonb not null default '{"films": [], "schedule": {}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.mostra_boards enable row level security;

create policy "Users can read their own board"
  on public.mostra_boards for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own board"
  on public.mostra_boards for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own board"
  on public.mostra_boards for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter publication supabase_realtime add table public.mostra_boards;