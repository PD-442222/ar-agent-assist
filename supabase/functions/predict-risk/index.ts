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

    const { invoice_id } = await req.json();

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: 'invoice_id is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log(`Predicting risk for invoice ${invoice_id} (tenant: ${profile.tenant_id})`);

    // Fetch invoice and customer data filtered by tenant
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select(`
        invoice_id,
        amount,
        customers (
          customer_id,
          name,
          payment_history_notes
        )
      `)
      .eq('invoice_id', invoice_id)
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (fetchError || !invoice) {
      console.error('Error fetching invoice:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      );
    }

    // Cast to proper type for nested data
    const invoiceData = invoice as any;

    // Mock AI Risk Prediction Logic
    let risk_score = 0.1;
    let risk_explanation = 'No significant risk factors detected. Customer has a good payment history.';
    const risk_factors = [];

    // Rule 1: High invoice value
    if (parseFloat(invoiceData.amount) > 10000) {
      risk_score = Math.max(risk_score, 0.8);
      risk_factors.push('High invoice value (>' + invoiceData.amount + ') increases risk');
    }

    // Rule 2: Customer payment history contains "late"
    const paymentNotes = invoiceData.customers?.payment_history_notes?.toLowerCase() || '';
    if (paymentNotes.includes('late')) {
      risk_score = Math.max(risk_score, 0.6);
      risk_factors.push('Customer has a history of late payments');
    }

    // Rule 3: New customer (no history)
    if (paymentNotes.includes('no history') || paymentNotes.includes('new customer')) {
      risk_score = Math.max(risk_score, 0.5);
      risk_factors.push('New customer with no payment history');
    }

    // Generate explanation based on risk factors
    if (risk_factors.length > 0) {
      risk_explanation = 'Risk factors identified: ' + risk_factors.join('; ') + '.';
      
      if (risk_score >= 0.7) {
        risk_explanation += ' HIGH RISK - Recommend proactive contact with customer and payment plan discussion.';
      } else if (risk_score >= 0.5) {
        risk_explanation += ' MEDIUM RISK - Monitor closely and send payment reminder 5 days before due date.';
      } else {
        risk_explanation += ' LOW-MEDIUM RISK - Standard collection procedures recommended.';
      }
    }

    console.log(`Risk prediction: ${risk_score} - ${risk_explanation}`);

    // Update the invoice with risk score and explanation
    const { data: updatedInvoices, error: updateError } = await supabase
      .from('invoices')
      .update({
        risk_score: risk_score,
        risk_explanation: risk_explanation
      })
      .eq('invoice_id', invoice_id)
      .eq('tenant_id', profile.tenant_id)
      .select('invoice_id');

    if (updateError) {
      console.error('Error updating invoice:', updateError);
      throw updateError;
    }

    if (!updatedInvoices || updatedInvoices.length === 0) {
      console.error('No invoice updated for tenant:', profile.tenant_id);
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }

    console.log('Successfully updated invoice with risk prediction');

    return new Response(
      JSON.stringify({
        risk_score: risk_score,
        risk_explanation: risk_explanation,
        invoice_id: invoice_id
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
