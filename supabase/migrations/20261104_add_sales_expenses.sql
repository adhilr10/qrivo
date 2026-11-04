-- ==============================================================================
-- Qrivo: QR sales and business expenses (Money section)
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- ==============================================================================

-- 1. Money: QR sales ------------------------------------------------------------
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

-- 2. Money: business expenses ---------------------------------------------------
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

-- 3. Row Level Security ---------------------------------------------------------
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

-- The former To-do pipeline is no longer used. If an earlier version created
-- it, you can remove the leftover table manually:
-- DROP TABLE IF EXISTS public.business_todos;
