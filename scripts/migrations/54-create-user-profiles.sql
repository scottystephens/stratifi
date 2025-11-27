-- Create user profiles table for persisted rate preferences
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{"watchlist":[],"baseCurrency":"USD","timeRange":"30D"}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS policy: users can only select/update their own profile
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their profile"
  ON public.user_profiles
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their profile"
  ON public.user_profiles
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Trigger helper: keep updated_at fresh
CREATE OR REPLACE FUNCTION public.user_profiles_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.user_profiles_set_updated_at();

-- Automatically provision profile when a new auth user is created
CREATE OR REPLACE FUNCTION public.create_user_profile_from_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_user_profile_after_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_user_profile_from_auth();

-- Comments
COMMENT ON TABLE public.user_profiles IS 'Per-user persisted preferences for Exchange Rates page';
COMMENT ON COLUMN public.user_profiles.preferences IS 'Stored JSON (watchlist, baseCurrency, layout, etc.)';

