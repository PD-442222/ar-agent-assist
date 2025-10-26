-- Create customers table
CREATE TABLE public.customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  payment_history_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create invoices table
CREATE TABLE public.invoices (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(customer_id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT UNIQUE NOT NULL,
  amount NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'paid', 'disputed', 'overdue')),
  risk_score FLOAT,
  risk_explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create payments table
CREATE TABLE public.payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_received NUMERIC NOT NULL,
  payment_date DATE NOT NULL,
  status TEXT DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'needs_review')),
  matched_invoice_id UUID REFERENCES public.invoices(invoice_id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create disputes table
CREATE TABLE public.disputes (
  dispute_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(invoice_id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'resolved')),
  disputed_amount NUMERIC NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public access (since these are mock APIs)
CREATE POLICY "Public access to customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to invoices" ON public.invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to payments" ON public.payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to disputes" ON public.disputes FOR ALL USING (true) WITH CHECK (true);

-- Insert mock customer data
INSERT INTO public.customers (name, payment_history_notes) VALUES
  ('Big Corp Inc.', 'Always pays on time'),
  ('Zenith Industries', 'Historically pays large invoices 15 days late'),
  ('Apex Manufacturing', 'Occasionally late on payments over $10,000'),
  ('Global Solutions Ltd.', 'Excellent payment history'),
  ('TechStart Systems', 'New customer, no history');

-- Insert mock invoice data
INSERT INTO public.invoices (customer_id, invoice_number, amount, due_date, status)
SELECT 
  customer_id,
  'INV-' || LPAD((ROW_NUMBER() OVER())::TEXT, 3, '0'),
  CASE 
    WHEN random() < 0.3 THEN (random() * 15000 + 5000)::NUMERIC(10,2)
    ELSE (random() * 5000 + 1000)::NUMERIC(10,2)
  END,
  CURRENT_DATE + (random() * 60 - 30)::INTEGER,
  CASE 
    WHEN random() < 0.7 THEN 'open'
    WHEN random() < 0.85 THEN 'paid'
    ELSE 'overdue'
  END
FROM public.customers
CROSS JOIN generate_series(1, 3);

-- Insert mock payment data
INSERT INTO public.payments (amount_received, payment_date, status)
VALUES
  (5000.00, CURRENT_DATE - 5, 'unmatched'),
  (12000.00, CURRENT_DATE - 3, 'unmatched'),
  (3500.00, CURRENT_DATE - 1, 'unmatched');