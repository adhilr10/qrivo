-- ==============================================================================
-- Qrivo Database Schema for Supabase
-- Production-Ready Migration
-- ==============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Businesses Table
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT DEFAULT '',
    brand_color VARCHAR(20) DEFAULT '#2563eb',
    category VARCHAR(120) DEFAULT '',
    place_name VARCHAR(120) DEFAULT '',
    road VARCHAR(160) DEFAULT '',
    google_review_url TEXT NOT NULL,
    whatsapp_number VARCHAR(50) DEFAULT '',
    whatsapp_message TEXT DEFAULT 'Hi! I visited your business and would like to connect.',
    phone_number VARCHAR(50) DEFAULT '',
    instagram_url TEXT DEFAULT '',
    facebook_url TEXT DEFAULT '',
    custom_message TEXT DEFAULT 'Thank you for your visit! Your review helps our local team grow.',
    is_active BOOLEAN DEFAULT true NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_email TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Existing projects created before admin auth or new columns may already have this table.
-- CREATE TABLE IF NOT EXISTS does not add columns, so keep this migration safe.
ALTER TABLE public.businesses
    ADD COLUMN IF NOT EXISTS whatsapp_message TEXT DEFAULT 'Hi! I visited your business and would like to connect.',
    ADD COLUMN IF NOT EXISTS custom_message TEXT DEFAULT 'Thank you for your visit! Your review helps our local team grow.',
    ADD COLUMN IF NOT EXISTS place_name VARCHAR(120) DEFAULT '',
    ADD COLUMN IF NOT EXISTS road VARCHAR(160) DEFAULT '',
    ADD COLUMN IF NOT EXISTS category VARCHAR(120) DEFAULT '',
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS owner_email TEXT DEFAULT '';

-- Index for fast lookup by slug (Counter QR landing page query)
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON public.businesses (slug);
CREATE INDEX IF NOT EXISTS idx_businesses_active ON public.businesses (is_active);

-- 1b. Permanent QR shortener. Printed /s/{code} URLs never change; business_id can be reassigned.
CREATE TABLE IF NOT EXISTS public.short_links (
    code VARCHAR(12) PRIMARY KEY,
    business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
    last_label TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_short_links_business_id
    ON public.short_links (business_id)
    WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_short_links_unassigned
    ON public.short_links (updated_at DESC)
    WHERE business_id IS NULL;

-- 2. Row Level Security (RLS)
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

-- Drop old policies if recreating
DROP POLICY IF EXISTS "Public can view active businesses" ON public.businesses;
DROP POLICY IF EXISTS "Public can view businesses by slug" ON public.businesses;
DROP POLICY IF EXISTS "Admins can view all their businesses" ON public.businesses;
DROP POLICY IF EXISTS "Admins can insert businesses" ON public.businesses;
DROP POLICY IF EXISTS "Admins can update their businesses" ON public.businesses;
DROP POLICY IF EXISTS "Admins can delete their businesses" ON public.businesses;
DROP POLICY IF EXISTS "Admins manage businesses" ON public.businesses;
DROP POLICY IF EXISTS "Service role full access on businesses" ON public.businesses;

-- Allow public read access to businesses (needed for customer QR scan landing page)
CREATE POLICY "Public can view businesses by slug"
    ON public.businesses
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- The Admin Portal is a shared workspace: every signed-in admin can see and
-- manage every business, including ones created by another admin.
CREATE POLICY "Admins manage businesses"
    ON public.businesses
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "Service role full access on businesses"
    ON public.businesses
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Public can resolve short links" ON public.short_links;
DROP POLICY IF EXISTS "Admins manage short links" ON public.short_links;
DROP POLICY IF EXISTS "Service role full access on short links" ON public.short_links;

CREATE POLICY "Public can resolve short links"
    ON public.short_links
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Admins manage short links"
    ON public.short_links
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full access on short links"
    ON public.short_links
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 3. Money: QR sales and business expenses (admin only — never public)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.qr_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
    business_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 400,
    unit_cost NUMERIC(12,2) NOT NULL DEFAULT 55,
    -- Snapshot of quantity * price / cost so history never changes when the
    -- default sale price is edited later.
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT DEFAULT '',
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_email TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qr_sales_date ON public.qr_sales (sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_qr_sales_status ON public.qr_sales (status);

CREATE TABLE IF NOT EXISTS public.qr_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category TEXT DEFAULT 'Other',
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT DEFAULT '',
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_email TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qr_expenses_date ON public.qr_expenses (expense_date DESC);

-- Financial data is private: only signed-in admins may read or change it.
ALTER TABLE public.qr_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage sales" ON public.qr_sales;
CREATE POLICY "Admins manage sales"
    ON public.qr_sales
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on sales" ON public.qr_sales;
CREATE POLICY "Service role full access on sales"
    ON public.qr_sales
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admins manage expenses" ON public.qr_expenses;
CREATE POLICY "Admins manage expenses"
    ON public.qr_expenses
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on expenses" ON public.qr_expenses;
CREATE POLICY "Service role full access on expenses"
    ON public.qr_expenses
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
