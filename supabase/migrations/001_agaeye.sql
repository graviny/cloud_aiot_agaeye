-- Run once in the Supabase SQL Editor. No passwords or API keys belong in this file.
begin;

create table if not exists public.agaeye_devices (
  device_id text primary key,
  owner_id uuid not null references auth.users(id),
  data jsonb not null,
  check (device_id ~ '^[A-Za-z0-9_-]{1,96}$')
);

create table if not exists public.agaeye_events (
  event_id text primary key,
  device_id text not null references public.agaeye_devices(device_id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  received_at double precision not null,
  data jsonb not null,
  snapshot_path text,
  check (event_id ~ '^[A-Za-z0-9_-]{1,96}$')
);
create index if not exists agaeye_events_owner_time on public.agaeye_events(owner_id, device_id, received_at desc);

create table if not exists public.agaeye_settings (
  device_id text primary key references public.agaeye_devices(device_id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  data jsonb not null
);

create table if not exists public.agaeye_alerts (
  alert_id text primary key,
  device_id text not null references public.agaeye_devices(device_id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  received_at double precision not null,
  data jsonb not null
);
create index if not exists agaeye_alerts_owner_time on public.agaeye_alerts(owner_id, device_id, received_at desc);

alter table public.agaeye_devices enable row level security;
alter table public.agaeye_events enable row level security;
alter table public.agaeye_settings enable row level security;
alter table public.agaeye_alerts enable row level security;

revoke all on public.agaeye_devices, public.agaeye_events, public.agaeye_settings, public.agaeye_alerts from anon, authenticated;
grant select on public.agaeye_devices, public.agaeye_events, public.agaeye_settings, public.agaeye_alerts to authenticated;
grant all on public.agaeye_devices, public.agaeye_events, public.agaeye_settings, public.agaeye_alerts to service_role;

drop policy if exists agaeye_devices_read_own on public.agaeye_devices;
create policy agaeye_devices_read_own on public.agaeye_devices for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists agaeye_events_read_own on public.agaeye_events;
create policy agaeye_events_read_own on public.agaeye_events for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists agaeye_settings_read_own on public.agaeye_settings;
create policy agaeye_settings_read_own on public.agaeye_settings for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists agaeye_alerts_read_own on public.agaeye_alerts;
create policy agaeye_alerts_read_own on public.agaeye_alerts for select to authenticated using (owner_id = (select auth.uid()));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('agaeye-snapshots', 'agaeye-snapshots', false, 2000000, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 2000000, allowed_mime_types = array['image/jpeg'];
-- No public/client storage policies. Only the authenticated cloud API proxies photos.
commit;
