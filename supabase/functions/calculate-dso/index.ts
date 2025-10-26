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

    const { data: matchedPayments, error: matchedPaymentsError } = await supabase
      .from('payments')
      .select(`
        payment_date,
        matched_invoice_id,
        invoices:matched_invoice_id (
          invoice_id,
          created_at,
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

    const paidDurations: number[] = (matchedPayments || [])
      .map((payment: any) => {
        const invoice = Array.isArray(payment.invoices) ? payment.invoices[0] : payment.invoices;
        if (!invoice || invoice.tenant_id !== profile.tenant_id) {
          return null;
        }

        const paymentDate = new Date(payment.payment_date);
        const issuedDate = new Date(invoice.created_at);

        if (isNaN(paymentDate.getTime()) || isNaN(issuedDate.getTime())) {
          return null;
        }

        const diff = Math.round((paymentDate.getTime() - issuedDate.getTime()) / MS_PER_DAY);
        return Math.max(0, diff);
      })
      .filter((value): value is number => value !== null && Number.isFinite(value));

    const { data: outstandingInvoices, error: outstandingError } = await supabase
      .from('invoices')
      .select('created_at, status, tenant_id')
      .eq('tenant_id', profile.tenant_id)
      .in('status', ['open', 'overdue', 'disputed']);

    if (outstandingError) {
      console.error('Error fetching outstanding invoices:', outstandingError);
      throw outstandingError;
    }

    const today = new Date();
    const outstandingDurations: number[] = (outstandingInvoices || [])
      .map((invoice: any) => {
        if (invoice.tenant_id !== profile.tenant_id) {
          return null;
        }

        const createdDate = new Date(invoice.created_at);
        if (isNaN(createdDate.getTime())) {
          return null;
        }

        const diff = Math.round((today.getTime() - createdDate.getTime()) / MS_PER_DAY);
        return Math.max(0, diff);
      })
      .filter((value): value is number => value !== null && Number.isFinite(value));

    const durations = paidDurations.length > 0
      ? paidDurations.concat(outstandingDurations)
      : outstandingDurations;

    if (durations.length === 0) {
      return new Response(
        JSON.stringify({ dso: 0 }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    const totalDays = durations.reduce((sum, value) => sum + value, 0);
    const avgDSO = Math.round(totalDays / durations.length);
    console.log(`DSO calculated: ${avgDSO} days from ${durations.length} records`);

    return new Response(
      JSON.stringify({ dso: avgDSO }),
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
