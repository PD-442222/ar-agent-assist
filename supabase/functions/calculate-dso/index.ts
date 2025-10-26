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

    // Fetch all paid invoices for this tenant
    const { data: paidInvoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('due_date, created_at')
      .eq('status', 'paid')
      .eq('tenant_id', profile.tenant_id);

    if (invoicesError) {
      console.error('Error fetching paid invoices:', invoicesError);
      throw invoicesError;
    }

    if (!paidInvoices || paidInvoices.length === 0) {
      // No paid invoices, return 0
      return new Response(
        JSON.stringify({ dso: 0 }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Calculate average days to payment
    let totalDays = 0;
    for (const invoice of paidInvoices) {
      const dueDate = new Date(invoice.due_date);
      const createdDate = new Date(invoice.created_at);
      const daysDiff = Math.floor((dueDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      totalDays += Math.max(0, daysDiff);
    }

    const avgDSO = Math.round(totalDays / paidInvoices.length);
    console.log(`DSO calculated: ${avgDSO} days (${paidInvoices.length} paid invoices)`);

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
