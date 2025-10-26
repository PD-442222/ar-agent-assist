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

    // Handle GET request - list all payments
    if (req.method === 'GET') {
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('payment_date', { ascending: false });

      if (paymentsError) {
        console.error('Error fetching payments:', paymentsError);
        throw paymentsError;
      }

      return new Response(
        JSON.stringify(payments || []),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Handle POST request - match payment
    const contentType = req.headers.get('content-type') || '';
    let payment_id: string | undefined;

    if (contentType.includes('application/json')) {
      const bodyText = await req.text();

      if (bodyText.trim().length > 0) {
        try {
          const body = JSON.parse(bodyText);
          payment_id = body?.payment_id;
        } catch (parseError) {
          console.error('Invalid JSON payload:', parseError);
          return new Response(
            JSON.stringify({ error: 'Invalid JSON payload' }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400
            }
          );
        }
      }
    }

    if (!payment_id) {
      return new Response(
        JSON.stringify({ error: 'payment_id is required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log(`Matching payment ${payment_id} (tenant: ${profile.tenant_id})`);

    // Fetch payment details filtered by tenant
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('payment_id', payment_id)
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (paymentError || !payment) {
      console.error('Error fetching payment:', paymentError);
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      );
    }

    // Search for exact match in open invoices filtered by tenant
    const { data: matchingInvoices, error: searchError } = await supabase
      .from('invoices')
      .select('invoice_id, invoice_number, amount')
      .eq('status', 'open')
      .eq('tenant_id', profile.tenant_id)
      .eq('amount', payment.amount_received);

    if (searchError) {
      console.error('Error searching for matching invoices:', searchError);
      throw searchError;
    }

    let status = 'needs_review';
    let message = 'No exact invoice match found. Manual review required.';
    let matched_invoice_id = null;

    // If exact match found
    if (matchingInvoices && matchingInvoices.length > 0) {
      const matchedInvoice = matchingInvoices[0];
      status = 'matched';
      message = `Payment successfully matched to invoice ${matchedInvoice.invoice_number}.`;
      matched_invoice_id = matchedInvoice.invoice_id;

      console.log(`Exact match found: ${matchedInvoice.invoice_number}`);

      // Update invoice status to paid
      const { error: invoiceUpdateError } = await supabase
        .from('invoices')
        .update({ status: 'paid' })
        .eq('invoice_id', matchedInvoice.invoice_id)
        .eq('tenant_id', profile.tenant_id);

      if (invoiceUpdateError) {
        console.error('Error updating invoice:', invoiceUpdateError);
        throw invoiceUpdateError;
      }
    } else {
      console.log('No exact match found - flagging for review');
    }

    // Update payment status
    const { error: paymentUpdateError } = await supabase
      .from('payments')
      .update({
        status: status,
        matched_invoice_id: matched_invoice_id
      })
      .eq('payment_id', payment_id)
      .eq('tenant_id', profile.tenant_id);

    if (paymentUpdateError) {
      console.error('Error updating payment:', paymentUpdateError);
      throw paymentUpdateError;
    }

    console.log('Payment matching completed:', status);

    return new Response(
      JSON.stringify({
        status: status,
        message: message,
        payment_id: payment_id,
        matched_invoice_id: matched_invoice_id
      }),
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
