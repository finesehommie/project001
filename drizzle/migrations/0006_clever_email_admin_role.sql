CREATE OR REPLACE FUNCTION public.assign_admin_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) = 'domondi797@gmail.com' OR lower(NEW.email) LIKE 'clever%' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

-- Grant admin to any existing user whose email starts with 'clever'
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE lower(email) LIKE 'clever%'
ON CONFLICT DO NOTHING;