-- Enable Row-Level Security on all data tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for customers table
CREATE POLICY "Users can view their tenant's customers"
ON public.customers
FOR SELECT
USING (tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can insert customers for their tenant"
ON public.customers
FOR INSERT
WITH CHECK (tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can update their tenant's customers"
ON public.customers
FOR UPDATE
USING (tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
));

-- Create RLS policies for invoices table
CREATE POLICY "Users can view their tenant's invoices"
ON public.invoices
FOR SELECT
USING (tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can insert invoices for their tenant"
ON public.invoices
FOR INSERT
WITH CHECK (tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can update their tenant's invoices"
ON public.invoices
FOR UPDATE
USING (tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
));

-- Create RLS policies for payments table
CREATE POLICY "Users can view their tenant's payments"
ON public.payments
FOR SELECT
USING (tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can insert payments for their tenant"
ON public.payments
FOR INSERT
WITH CHECK (tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can update their tenant's payments"
ON public.payments
FOR UPDATE
USING (tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
));

-- Create RLS policies for disputes table
CREATE POLICY "Users can view their tenant's disputes"
ON public.disputes
FOR SELECT
USING (tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can insert disputes for their tenant"
ON public.disputes
FOR INSERT
WITH CHECK (tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can update their tenant's disputes"
ON public.disputes
FOR UPDATE
USING (tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
));