-- Rename the old `tagline` column to `category`.
-- Safe to re-run: it only changes the schema when `category` does not exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'businesses'
      AND column_name = 'tagline'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'businesses'
      AND column_name = 'category'
  ) THEN
    ALTER TABLE public.businesses RENAME COLUMN tagline TO category;
  END IF;
END $$;

-- If both columns exist (e.g. created manually), keep the data and drop the old one.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'businesses'
      AND column_name = 'tagline'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'businesses'
      AND column_name = 'category'
  ) THEN
    UPDATE public.businesses
    SET category = tagline
    WHERE (category IS NULL OR category = '') AND tagline <> '';

    ALTER TABLE public.businesses DROP COLUMN tagline;
  END IF;
END $$;

-- Make sure the new SEO columns exist on older projects.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS category VARCHAR(120) DEFAULT '',
  ADD COLUMN IF NOT EXISTS place_name VARCHAR(120) DEFAULT '',
  ADD COLUMN IF NOT EXISTS road VARCHAR(160) DEFAULT '';
