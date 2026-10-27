-- Apply this once in the Supabase SQL Editor for projects created before
-- admin authentication was added.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Admins manage businesses" ON public.businesses;

CREATE POLICY "Admins manage businesses"
  ON public.businesses
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
