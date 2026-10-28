-- Add owner_email column to businesses table.
-- Stores the email address of the admin who originally created each business.
-- This allows any admin to see who created a shop without needing auth.admin access.

ALTER TABLE public.businesses
    ADD COLUMN IF NOT EXISTS owner_email TEXT DEFAULT '';

-- Back-fill is not possible for existing rows without auth.admin access,
-- so existing rows will show an empty string. New rows capture email at creation.

COMMENT ON COLUMN public.businesses.owner_email IS
    'Email of the admin who created this business. Captured at creation time.';
