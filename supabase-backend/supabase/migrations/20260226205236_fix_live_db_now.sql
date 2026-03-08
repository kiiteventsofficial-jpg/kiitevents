-- 1. Create a SECURITY DEFINER function to securely check user roles without triggering RLS evaluation
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Create a SECURITY DEFINER function to securely check admin roles (admin or super_admin)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Drop existing potentially recursive policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Super Admins can update profiles." ON profiles;
    DROP POLICY IF EXISTS "Admins can insert events." ON events;
    DROP POLICY IF EXISTS "Admins can update their own events." ON events;
    DROP POLICY IF EXISTS "Admins can delete their own events." ON events;
    DROP POLICY IF EXISTS "Admins can insert societies." ON societies;
    DROP POLICY IF EXISTS "Admins can update societies." ON societies;
    DROP POLICY IF EXISTS "Admins can delete societies." ON societies;
    DROP POLICY IF EXISTS "Admins can update their own societies." ON societies;
    DROP POLICY IF EXISTS "Admins can delete their own societies." ON societies;
END $$;

-- 4. Re-create the Profiles policy using the secure function
CREATE POLICY "Super Admins can update profiles." 
ON profiles FOR UPDATE 
USING (
  is_super_admin()
);

-- 5. Re-create Events policies using secure functions
CREATE POLICY "Admins can insert events." 
ON events FOR INSERT 
WITH CHECK ( is_admin() );

CREATE POLICY "Admins can update their own events." 
ON events FOR UPDATE 
USING (
  auth.uid() = created_by OR is_super_admin()
);

CREATE POLICY "Admins can delete their own events." 
ON events FOR DELETE 
USING (
  auth.uid() = created_by OR is_super_admin()
);

-- 6. Re-create Societies policies using secure functions
CREATE POLICY "Admins can insert societies." 
ON societies FOR INSERT 
WITH CHECK ( is_admin() );

CREATE POLICY "Admins can update societies." 
ON societies FOR UPDATE 
USING (
  created_by = auth.uid() OR is_super_admin()
);

CREATE POLICY "Admins can delete societies." 
ON societies FOR DELETE 
USING (
  created_by = auth.uid() OR is_super_admin()
);

-- 7. Sync new users from auth.users to public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name',
    'student' -- Default role is student
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

INSERT INTO public.profiles (id, email, full_name, role)
SELECT 
  id, 
  email, 
  raw_user_meta_data->>'full_name',
  'student'
FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE public.profiles.id = auth.users.id
)
ON CONFLICT (id) DO NOTHING;

-- 8. Add missing columns to the events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS end_time text,
  ADD COLUMN IF NOT EXISTS mode text DEFAULT 'Offline',
  ADD COLUMN IF NOT EXISTS audience text DEFAULT 'Open for All',
  ADD COLUMN IF NOT EXISTS max_participants integer,
  ADD COLUMN IF NOT EXISTS registration_deadline timestamp with time zone,
  ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_sharing boolean DEFAULT true;

-- Reload the PostgREST schema cache
NOTIFY pgrst, 'reload schema';
