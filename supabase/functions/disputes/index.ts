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

    const method = req.method;
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    // GET /api/disputes - Get all disputes
    if (method === 'GET') {
      console.log(`Fetching disputes for tenant: ${profile.tenant_id}`);

      const { data: disputes, error } = await supabase
        .from('disputes')
        .select(`
          dispute_id,
          status,
          disputed_amount,
          reason,
          created_at,
          invoices (
            invoice_id,
            invoice_number,
            amount,
            customers (
              customer_id,
              name
            )
          )
        `)
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching disputes:', error);
        throw error;
      }

      const formattedDisputes = disputes.map((dispute: any) => ({
        dispute_id: dispute.dispute_id,
        status: dispute.status,
        disputed_amount: parseFloat(dispute.disputed_amount),
        reason: dispute.reason,
        created_at: dispute.created_at,
        invoice_id: dispute.invoices?.invoice_id,
        invoice_number: dispute.invoices?.invoice_number,
        invoice_amount: parseFloat(dispute.invoices?.amount || '0'),
        customer_name: dispute.invoices?.customers?.name || 'Unknown Customer'
      }));

      console.log(`Successfully fetched ${formattedDisputes.length} disputes`);

      return new Response(
        JSON.stringify(formattedDisputes),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // POST /api/disputes - Create a new dispute
    if (method === 'POST') {
      const { invoice_id, disputed_amount, reason } = await req.json();

      if (!invoice_id || !disputed_amount) {
        return new Response(
          JSON.stringify({ error: 'invoice_id and disputed_amount are required' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400 
          }
        );
      }

      console.log(`Creating new dispute for invoice ${invoice_id} (tenant: ${profile.tenant_id})`);

      // Verify invoice belongs to this tenant
      const { data: invoiceCheck, error: invoiceCheckError } = await supabase
        .from('invoices')
        .select('invoice_id')
        .eq('invoice_id', invoice_id)
        .eq('tenant_id', profile.tenant_id)
        .single();

      if (invoiceCheckError || !invoiceCheck) {
        return new Response(
          JSON.stringify({ error: 'Invoice not found or access denied' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404 
          }
        );
      }

      // Create the dispute with tenant_id
      const { data: dispute, error: createError } = await supabase
        .from('disputes')
        .insert({
          invoice_id: invoice_id,
          disputed_amount: disputed_amount,
          reason: reason || null,
          status: 'new',
          tenant_id: profile.tenant_id
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating dispute:', createError);
        throw createError;
      }

      // Update invoice status to disputed
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ status: 'disputed' })
        .eq('invoice_id', invoice_id);

      if (updateError) {
        console.error('Error updating invoice status:', updateError);
        throw updateError;
      }

      console.log('Successfully created dispute:', dispute.dispute_id);

      return new Response(
        JSON.stringify({
          message: 'Dispute created successfully',
          dispute: dispute
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 201 
        }
      );
    }

    // PUT /api/disputes/:dispute_id - Update a dispute
    if (method === 'PUT') {
      const { dispute_id, status, reason } = await req.json();

      if (!dispute_id) {
        return new Response(
          JSON.stringify({ error: 'dispute_id is required' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400 
          }
        );
      }

      console.log(`Updating dispute ${dispute_id} (tenant: ${profile.tenant_id})`);

      const updateData: any = {};
      if (status) updateData.status = status;
      if (reason !== undefined) updateData.reason = reason;

      const { data: dispute, error: updateError } = await supabase
        .from('disputes')
        .update(updateData)
        .eq('dispute_id', dispute_id)
        .eq('tenant_id', profile.tenant_id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating dispute:', updateError);
        throw updateError;
      }

      console.log('Successfully updated dispute');

      return new Response(
        JSON.stringify({
          message: 'Dispute updated successfully',
          dispute: dispute
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Method not allowed
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
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
