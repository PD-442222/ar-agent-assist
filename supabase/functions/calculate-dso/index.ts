import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401 
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Get user's tenant_id
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Error getting user:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401 
        }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error getting profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      );
    }

    console.log(`Calculating DSO for tenant: ${profile.tenant_id}`);

    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    const toNumber = (value: any): number => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    const { data: outstandingInvoices, error: outstandingError } = await supabase
      .from('invoices')
      .select('amount, due_date, tenant_id')
      .eq('tenant_id', profile.tenant_id)
      .in('status', ['open', 'overdue', 'disputed']);

    if (outstandingError) {
      console.error('Error fetching outstanding invoices:', outstandingError);
      throw outstandingError;
    }

    const today = new Date();
    let weightedOutstandingDays = 0;
    let outstandingAmountTotal = 0;

    for (const invoice of outstandingInvoices || []) {
      if (!invoice || invoice.tenant_id !== profile.tenant_id) continue;

      const amount = toNumber(invoice.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
      if (!dueDate || isNaN(dueDate.getTime())) continue;

      const daysOutstanding = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / MS_PER_DAY));
      weightedOutstandingDays += daysOutstanding * amount;
      outstandingAmountTotal += amount;
    }

    if (outstandingAmountTotal > 0 && weightedOutstandingDays > 0) {
      const avgDSO = Math.round(weightedOutstandingDays / outstandingAmountTotal);
      console.log(`DSO calculated from outstanding invoices: ${avgDSO} days across ${outstandingInvoices?.length || 0} invoices`);

      return new Response(
        JSON.stringify({ dso: avgDSO }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    const { data: matchedPayments, error: matchedPaymentsError } = await supabase
      .from('payments')
      .select(`
        amount_received,
        payment_date,
        matched_invoice_id,
        invoices:matched_invoice_id (
          amount,
          due_date,
          tenant_id
        )
      `)
      .eq('tenant_id', profile.tenant_id)
      .eq('status', 'matched')
      .not('matched_invoice_id', 'is', null);

    if (matchedPaymentsError) {
      console.error('Error fetching matched payments:', matchedPaymentsError);
      throw matchedPaymentsError;
    }

    let weightedPaymentDays = 0;
    let totalPaidAmount = 0;

    for (const payment of matchedPayments || []) {
      const invoice = Array.isArray(payment.invoices) ? payment.invoices[0] : payment.invoices;
      if (!invoice || invoice.tenant_id !== profile.tenant_id) continue;

      const amount = toNumber(payment.amount_received ?? invoice.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const paymentDate = payment.payment_date ? new Date(payment.payment_date) : null;
      const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
      if (!paymentDate || isNaN(paymentDate.getTime()) || !dueDate || isNaN(dueDate.getTime())) continue;

      const daysToCollect = Math.max(0, Math.floor((paymentDate.getTime() - dueDate.getTime()) / MS_PER_DAY));
      weightedPaymentDays += daysToCollect * amount;
      totalPaidAmount += amount;
    }

    if (totalPaidAmount > 0 && weightedPaymentDays > 0) {
      const avgDSO = Math.round(weightedPaymentDays / totalPaidAmount);
      console.log(`DSO calculated from matched payments: ${avgDSO} days across ${matchedPayments?.length || 0} payments`);

      return new Response(
        JSON.stringify({ dso: avgDSO }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // As a final fallback, return a neutral baseline if invoices exist at all
    const { count: invoiceCount } = await supabase
      .from('invoices')
      .select('invoice_id', { count: 'exact', head: true })
      .eq('tenant_id', profile.tenant_id);

    const fallbackDSO = invoiceCount && invoiceCount > 0 ? 35 : 0;
    console.log(`DSO fallback engaged, returning ${fallbackDSO}`);

    return new Response(
      JSON.stringify({ dso: fallbackDSO }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
