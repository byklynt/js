-- Blog: posts written by admins, read by everyone once published.
-- Visibility rule (RLS, so it holds for any client): status = 'terbit' AND published_at <= now(). A post with a future date is "Terjadwal": it
-- becomes visible at that time by itself (no cron). Drafts are never readable by anon / normal users. Only admins write (private.is_admin()).

create table public.blog_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.blog_tags (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.blog_posts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  title           text not null check (char_length(btrim(title)) between 1 and 160),
  excerpt         text not null default '' check (char_length(excerpt) <= 400),
  content_md      text not null default '' check (char_length(content_md) <= 200000),
  cover_image_url text,
  cover_alt       text not null default '' check (char_length(cover_alt) <= 200),
  category_id     uuid references public.blog_categories (id) on delete set null,
  status          text not null default 'draf' check (status in ('draf', 'terbit')),
  published_at    timestamptz,
  seo_title       text not null default '' check (char_length(seo_title) <= 70),
  seo_description text not null default '' check (char_length(seo_description) <= 170),
  author_id       uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint blog_posts_published_has_date check (status <> 'terbit' or published_at is not null)
);
create index blog_posts_visible_idx on public.blog_posts (published_at desc) where status = 'terbit';
create index blog_posts_category_idx on public.blog_posts (category_id);

create table public.blog_post_tags (
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  tag_id  uuid not null references public.blog_tags (id) on delete cascade,
  primary key (post_id, tag_id)
);
create index blog_post_tags_tag_idx on public.blog_post_tags (tag_id);

create or replace function public.blog_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger blog_posts_touch before update on public.blog_posts for each row execute function public.blog_touch();

-- "Visible to the public" in one place (used by the policies below).
create or replace function public.blog_post_is_public(p_status text, p_published_at timestamptz) returns boolean
language sql stable set search_path = public as $$
  select p_status = 'terbit' and p_published_at is not null and p_published_at <= now();
$$;

alter table public.blog_categories enable row level security;
alter table public.blog_tags       enable row level security;
alter table public.blog_posts      enable row level security;
alter table public.blog_post_tags  enable row level security;
revoke all on public.blog_categories, public.blog_tags, public.blog_posts, public.blog_post_tags from public, anon, authenticated;
grant select on public.blog_categories, public.blog_tags, public.blog_posts, public.blog_post_tags to anon, authenticated;
grant insert, update, delete on public.blog_categories, public.blog_tags, public.blog_posts, public.blog_post_tags to authenticated;

-- public reads: published posts, and only the categories / tags / links that belong to a published post (a draft's topic does not leak)
create policy blog_posts_public on public.blog_posts for select to anon, authenticated using (public.blog_post_is_public(status, published_at));
create policy blog_categories_public on public.blog_categories for select to anon, authenticated using (
  exists (select 1 from public.blog_posts p where p.category_id = blog_categories.id and public.blog_post_is_public(p.status, p.published_at)));
create policy blog_post_tags_public on public.blog_post_tags for select to anon, authenticated using (
  exists (select 1 from public.blog_posts p where p.id = blog_post_tags.post_id and public.blog_post_is_public(p.status, p.published_at)));
create policy blog_tags_public on public.blog_tags for select to anon, authenticated using (
  exists (select 1 from public.blog_post_tags t join public.blog_posts p on p.id = t.post_id
           where t.tag_id = blog_tags.id and public.blog_post_is_public(p.status, p.published_at)));

-- admins: everything (including drafts)
create policy blog_posts_admin on public.blog_posts for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy blog_categories_admin on public.blog_categories for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy blog_tags_admin on public.blog_tags for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy blog_post_tags_admin on public.blog_post_tags for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Storage: "blog-images" is public read, written only by admins; 2 MB, png / jpeg / webp (the bucket enforces it, the upload route checks again).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-images', 'blog-images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy blog_images_read on storage.objects for select to anon, authenticated using (bucket_id = 'blog-images');
create policy blog_images_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'blog-images' and private.is_admin());
create policy blog_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'blog-images' and private.is_admin()) with check (bucket_id = 'blog-images' and private.is_admin());
create policy blog_images_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'blog-images' and private.is_admin());
