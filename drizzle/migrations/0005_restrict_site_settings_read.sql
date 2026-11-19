DROP POLICY IF EXISTS site_settings_read ON public.site_settings;
CREATE POLICY site_settings_public_read ON public.site_settings FOR SELECT TO anon, authenticated USING (key = 'site_name');
CREATE POLICY site_settings_admin_read ON public.site_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));