-- Create tenants table
CREATE TABLE public.tenants (
  tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Create profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Function to auto-create tenant and profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id UUID;
BEGIN
  -- Create a new tenant for this user
  INSERT INTO public.tenants (tenant_name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  RETURNING tenant_id INTO new_tenant_id;
  
  -- Create profile linked to the new tenant
  INSERT INTO public.profiles (id, tenant_id, email)
  VALUES (NEW.id, new_tenant_id, NEW.email);
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-create tenant and profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for profiles (users can only see their own profile)
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for tenants (users can only see their own tenant)
CREATE POLICY "Users can view their own tenant"
  ON public.tenants
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Add tenant_id to existing tables
ALTER TABLE public.customers ADD COLUMN tenant_id UUID REFERENCES public.tenants(tenant_id);
ALTER TABLE public.invoices ADD COLUMN tenant_id UUID REFERENCES public.tenants(tenant_id);
ALTER TABLE public.payments ADD COLUMN tenant_id UUID REFERENCES public.tenants(tenant_id);
ALTER TABLE public.disputes ADD COLUMN tenant_id UUID REFERENCES public.tenants(tenant_id);

-- For now, set nullable to avoid breaking existing data
-- We'll make these NOT NULL after migrating existing data