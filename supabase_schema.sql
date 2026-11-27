-- ============================================================================
-- INSTALITE SUPABASE SCHEMA (PostgreSQL + RLS + Triggers + Storage + Realtime)
-- Jalankan seluruh script ini di Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. TABEL PROFIL PENGGUNA (email tetap privat di auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  bio text not null default '',
  photo_url text not null default '',
  photo_path text not null default '',
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-zA-Z0-9_.]{3,30}$'),
  constraint profiles_bio_length check (char_length(bio) <= 500),
  constraint profiles_photo_url_length check (char_length(photo_url) <= 2000),
  constraint profiles_photo_path_length check (char_length(photo_path) <= 500)
);

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- 2. TABEL POSTINGAN
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  caption text not null default '',
  media_url text not null default '',
  media_path text not null default '',
  media_type text not null default 'text',
  created_at timestamptz not null default now(),
  constraint posts_username_format check (username ~ '^[a-zA-Z0-9_.]{3,30}$'),
  constraint posts_caption_length check (char_length(caption) <= 2200),
  constraint posts_media_url_length check (char_length(media_url) <= 2000),
  constraint posts_media_path_length check (char_length(media_path) <= 500),
  constraint posts_media_type_valid check (media_type in ('text', 'image', 'video'))
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_user_id_idx on public.posts (user_id);

-- 3. TABEL LIKE POSTINGAN
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_post_id_idx on public.post_likes (post_id);

-- 4. TABEL KOMENTAR POSTINGAN
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  photo_url text not null default '',
  text text not null,
  created_at timestamptz not null default now(),
  constraint post_comments_username_format check (username ~ '^[a-zA-Z0-9_.]{3,30}$'),
  constraint post_comments_photo_url_length check (char_length(photo_url) <= 2000),
  constraint post_comments_text_length check (char_length(trim(text)) between 1 and 500)
);

create index if not exists post_comments_post_id_idx on public.post_comments (post_id, created_at asc);

-- 5. TABEL BOOKMARK (TERSIMPAN)
create table if not exists public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- 6. TABEL POSTINGAN DISEMBUNYIKAN
create table if not exists public.hidden_posts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- 7. TABEL FOLLOW & MUTUALAN
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create index if not exists follows_following_id_idx on public.follows (following_id);

-- 8. TABEL NOTIFIKASI REAL-TIME
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_username text not null,
  type text not null check (type in ('like', 'comment', 'mention', 'follow')),
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.post_comments(id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_no_self check (recipient_id <> sender_id),
  constraint notifications_message_length check (char_length(message) <= 500)
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.bookmarks enable row level security;
alter table public.hidden_posts enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;

-- PROFILES
drop policy if exists "profiles_select_auth" on public.profiles;
create policy "profiles_select_auth" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using (auth.uid() = id);

-- POSTS
drop policy if exists "posts_select_auth" on public.posts;
create policy "posts_select_auth" on public.posts
  for select to authenticated using (true);

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own" on public.posts
  for insert to authenticated with check (
    auth.uid() = user_id
    and username = (select p.username from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own" on public.posts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and username = (select p.username from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own" on public.posts
  for delete to authenticated using (auth.uid() = user_id);

-- POST LIKES
drop policy if exists "likes_select_auth" on public.post_likes;
create policy "likes_select_auth" on public.post_likes
  for select to authenticated using (true);

drop policy if exists "likes_insert_own" on public.post_likes;
create policy "likes_insert_own" on public.post_likes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "likes_delete_own" on public.post_likes;
create policy "likes_delete_own" on public.post_likes
  for delete to authenticated using (auth.uid() = user_id);

-- POST COMMENTS
drop policy if exists "comments_select_auth" on public.post_comments;
create policy "comments_select_auth" on public.post_comments
  for select to authenticated using (true);

drop policy if exists "comments_insert_own" on public.post_comments;
create policy "comments_insert_own" on public.post_comments
  for insert to authenticated with check (
    auth.uid() = user_id
    and username = (select p.username from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "comments_update_own" on public.post_comments;
create policy "comments_update_own" on public.post_comments
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and username = (select p.username from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "comments_delete_own" on public.post_comments;
create policy "comments_delete_own" on public.post_comments
  for delete to authenticated using (auth.uid() = user_id);

-- BOOKMARKS
drop policy if exists "bookmarks_all_own" on public.bookmarks;
create policy "bookmarks_all_own" on public.bookmarks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- HIDDEN POSTS
drop policy if exists "hidden_posts_all_own" on public.hidden_posts;
create policy "hidden_posts_all_own" on public.hidden_posts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- FOLLOWS
drop policy if exists "follows_select_auth" on public.follows;
create policy "follows_select_auth" on public.follows
  for select to authenticated using (true);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows
  for insert to authenticated with check (auth.uid() = follower_id and follower_id <> following_id);

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own" on public.follows
  for delete to authenticated using (auth.uid() = follower_id or auth.uid() = following_id);

-- NOTIFICATIONS
drop policy if exists "notifications_select_recipient" on public.notifications;
create policy "notifications_select_recipient" on public.notifications
  for select to authenticated using (auth.uid() = recipient_id);

drop policy if exists "notifications_insert_sender" on public.notifications;
create policy "notifications_insert_sender" on public.notifications
  for insert to authenticated with check (
    auth.uid() = sender_id
    and recipient_id <> sender_id
    and sender_username = (select p.username from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "notifications_update_recipient" on public.notifications;
create policy "notifications_update_recipient" on public.notifications
  for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

drop policy if exists "notifications_delete_recipient" on public.notifications;
create policy "notifications_delete_recipient" on public.notifications
  for delete to authenticated using (auth.uid() = recipient_id);

-- ============================================================================
-- FUNGSI RPC & TRIGGER OTOMATIS
-- ============================================================================

-- Cek ketersediaan username sebelum registrasi tanpa membuka daftar email
create or replace function public.is_username_available(p_username text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := trim(coalesce(p_username, ''));
begin
  if clean_name !~ '^[a-zA-Z0-9_.]{3,30}$' then
    return false;
  end if;
  return not exists (
    select 1 from public.profiles where lower(username) = lower(clean_name)
  );
end;
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;

-- Otomatis membuat profil di public.profiles setiap akun baru mendaftar
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  desired_username text := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  fallback_username text := 'user_' || left(replace(new.id::text, '-', ''), 8);
  final_username text;
begin
  if desired_username ~ '^[a-zA-Z0-9_.]{3,30}$'
     and not exists (select 1 from public.profiles where lower(username) = lower(desired_username)) then
    final_username := desired_username;
  else
    final_username := fallback_username;
  end if;

  insert into public.profiles (id, username, bio, photo_url, photo_path)
  values (new.id, final_username, '', '', '')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sinkronisasi username otomatis ke posts & comments saat user mengganti username
create or replace function public.sync_profile_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is distinct from old.username then
    update public.posts set username = new.username where user_id = new.id;
    update public.post_comments set username = new.username where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_username_updated on public.profiles;
create trigger on_profile_username_updated
  after update of username on public.profiles
  for each row execute function public.sync_profile_username();

-- Hapus akun sendiri secara aman (menghapus auth.users dan cascade semua tabel public)
create or replace function public.delete_user_self()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_user_self() to authenticated;

-- ============================================================================
-- SUPABASE STORAGE BUCKET & KEBIJAKAN AKSES (FOTO & VIDEO)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('instalite-media', 'instalite-media', true)
on conflict (id) do update set public = true;

drop policy if exists "InstaLite Public Read" on storage.objects;
create policy "InstaLite Public Read" on storage.objects
  for select to public
  using (bucket_id = 'instalite-media');

drop policy if exists "InstaLite Auth Insert Own Folder" on storage.objects;
create policy "InstaLite Auth Insert Own Folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'instalite-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "InstaLite Auth Update Own Folder" on storage.objects;
create policy "InstaLite Auth Update Own Folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'instalite-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "InstaLite Auth Delete Own Folder" on storage.objects;
create policy "InstaLite Auth Delete Own Folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'instalite-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- REALTIME PUBLICATION
-- ============================================================================
alter table public.profiles replica identity full;
alter table public.posts replica identity full;
alter table public.post_likes replica identity full;
alter table public.post_comments replica identity full;
alter table public.bookmarks replica identity full;
alter table public.hidden_posts replica identity full;
alter table public.follows replica identity full;
alter table public.notifications replica identity full;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['profiles','posts','post_likes','post_comments','bookmarks','hidden_posts','follows','notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
