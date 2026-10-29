-- ==============================================================================
-- ReviewHub Database Schema for Supabase
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
    tagline VARCHAR(255) DEFAULT '',
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

-- 2. Analytics Events Table
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
    slug VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'page_view', 'google_review_click', 'whatsapp_click', 'call_click', 'instagram_click', 'facebook_click'
    user_agent TEXT,
    referrer TEXT,
    ip_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for lightning fast analytics aggregation
CREATE INDEX IF NOT EXISTS idx_analytics_business_id ON public.analytics_events (business_id);
CREATE INDEX IF NOT EXISTS idx_analytics_slug ON public.analytics_events (slug);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON public.analytics_events (event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON public.analytics_events (created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
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

-- Analytics policies:
DROP POLICY IF EXISTS "Public can log analytics events" ON public.analytics_events;
DROP POLICY IF EXISTS "Admins can view analytics events" ON public.analytics_events;
DROP POLICY IF EXISTS "Service role full access on analytics" ON public.analytics_events;

-- Anyone scanning can log an event
CREATE POLICY "Public can log analytics events"
    ON public.analytics_events
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Admins can query analytics
CREATE POLICY "Admins can view analytics events"
    ON public.analytics_events
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Service role full access on analytics"
    ON public.analytics_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 4. Sample Seed Data for Instant Testing
INSERT INTO public.businesses (
    name,
    slug,
    logo_url,
    brand_color,
    tagline,
    google_review_url,
    whatsapp_number,
    whatsapp_message,
    phone_number,
    instagram_url,
    facebook_url,
    custom_message,
    is_active
) VALUES (
    'Artisan Roasters & Cafe',
    'artisan-cafe',
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=200&auto=format&fit=crop&q=80',
    '#d97706',
    'Specialty Coffee, Fresh Bakes & Cozy Vibes',
    'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    '+15550192834',
    'Hello Artisan Cafe! I have a question about today’s specials.',
    '+15550192834',
    'https://instagram.com/artisanroasterscafe',
    'https://facebook.com/artisancafespecialty',
    'We pour our passion into every cup! Your Google review helps fellow coffee lovers discover us.',
    true
),
(
    'Downtown Smiles Dental Clinic',
    'downtown-smiles',
    'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=200&auto=format&fit=crop&q=80',
    '#0284c7',
    'Gentle, modern dentistry for the entire family',
    'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    '+15550149201',
    'Hi Downtown Smiles! I’d like to inquire about booking an appointment.',
    '+15550149201',
    'https://instagram.com/downtownsmilesclinic',
    'https://facebook.com/downtownsmilesdental',
    'Thank you for visiting Downtown Smiles! How was your appointment today?',
    true
),
(
    'Apex Auto & Performance',
    'apex-auto',
    'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=200&auto=format&fit=crop&q=80',
    '#dc2626',
    'Certified European & Domestic Auto Repair',
    'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    '+15550183721',
    'Hi Apex Auto, I want to follow up on my vehicle service.',
    '+15550183721',
    'https://instagram.com/apexautoperformance',
    'https://facebook.com/apexautowerks',
    'Quality workmanship and honest pricing. If we took great care of your vehicle, please leave us a 5-star Google review!',
    true
)
ON CONFLICT (slug) DO NOTHING;
