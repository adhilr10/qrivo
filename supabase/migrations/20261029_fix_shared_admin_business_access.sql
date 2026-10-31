-- Fix: an admin could only see businesses they created themselves.
--
-- Root cause: the SELECT policy on public.businesses was scoped to
-- (auth.uid() = user_id) for signed-in users, so an authenticated admin saw
-- fewer rows than an anonymous visitor. That is why a business slug opened
-- fine in a private window but showed "Business Slug Not Found" for another
-- admin, and why the Admin Portal listed only the current user's rows.
--
-- Run this once in the Supabase SQL editor (or re-run supabase/schema.sql).
-- Safe to run repeatedly.

alter table public.businesses enable row level security;
alter table public.short_links enable row level security;

-- 1. Every business is readable by anonymous visitors (customer counter pages)
--    and by every signed-in admin.
drop policy if exists "Public can view active businesses" on public.businesses;
drop policy if exists "Public can view businesses by slug" on public.businesses;
create policy "Public can view businesses by slug"
    on public.businesses
    for select
    to anon, authenticated
    using (true);

-- 2. Every signed-in admin can create, edit and delete any business. The Admin
--    Portal is a shared workspace: cards are labelled with their creator.
drop policy if exists "Admins can view all their businesses" on public.businesses;
drop policy if exists "Admins can insert businesses" on public.businesses;
drop policy if exists "Admins can update their businesses" on public.businesses;
drop policy if exists "Admins can delete their businesses" on public.businesses;
drop policy if exists "Admins manage businesses" on public.businesses;
create policy "Admins manage businesses"
    on public.businesses
    for all
    to authenticated
    using (true)
    with check (true);

-- 3. Permanent QR short links stay global (reassignment across admins).
drop policy if exists "Admins manage short links" on public.short_links;
create policy "Admins manage short links"
    on public.short_links
    for all
    to authenticated
    using (true)
    with check (true);
