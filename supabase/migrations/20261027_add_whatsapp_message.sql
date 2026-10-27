-- ==============================================================================
-- Migration: Add whatsapp_message & reload schema cache
-- Safe: Does NOT drop tables or remove any existing data
-- ==============================================================================

-- 1. Safely add whatsapp_message column if it doesn't already exist
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS whatsapp_message TEXT DEFAULT 'Hi! I visited your business and would like to connect.';

-- 2. Safely ensure custom_message and user_id are also present
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS custom_message TEXT DEFAULT 'Thank you for your visit! Your review helps our local team grow.',
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Notify PostgREST to reload the schema cache immediately
NOTIFY pgrst, 'reload schema';
