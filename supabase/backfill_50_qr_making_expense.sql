-- ==============================================================================
-- Qrivo: one-time backfill for 50 already-generated blank QR stands
-- Run this only if those 50 QR codes were generated before the automatic
-- "QR Making" expense existed. It is safe to re-run.
--
-- Amount = 50 stands × ₹55 making cost = ₹2,750.
-- If your making cost is different, change the amount below.
-- ==============================================================================

INSERT INTO public.qr_expenses (title, category, amount, expense_date, note)
SELECT
    'Made 50 QR stands',
    'QR Making',
    2750,
    CURRENT_DATE,
    'Backfill: 50 QR stands × ₹55 making cost'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.qr_expenses
    WHERE category = 'QR Making'
      AND title = 'Made 50 QR stands'
);
