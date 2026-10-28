-- Permanent QR shortener codes.
-- The printed /s/{code} URL never changes. After a business is rejected or deleted,
-- the same short link can be pointed at a new business.

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

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

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
