import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const parseNumeric = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return Number(value ?? 0);
};

type InvoiceSummary = {
  invoice_id: string;
  invoice_number: string;
  amount: number;
  customer_id?: string | null;
};

type PartialMatchSuggestion = {
  invoices: InvoiceSummary[];
  total_amount: number;
  difference: number;
  confidence: number;
  reason: string;
};

const buildPartialMatches = (
  invoices: InvoiceSummary[],
  targetAmount: number
): PartialMatchSuggestion[] => {
  const tolerance = Math.max(targetAmount * 0.15, 500);
  const suggestions = new Map<string, PartialMatchSuggestion>();

  const registerSuggestion = (suggestion: PartialMatchSuggestion) => {
    const key = `${suggestion.invoices
      .map((invoice) => invoice.invoice_id)
      .sort()
      .join('-')}|${Math.round(suggestion.total_amount * 100)}`;

    const existing = suggestions.get(key);
    if (!existing || existing.confidence < suggestion.confidence) {
      suggestions.set(key, suggestion);
    }
  };

  const computeConfidence = (difference: number, invoiceCount: number) => {
    const relativeDiff = Math.min(Math.abs(difference) / Math.max(targetAmount, 1), 1);
    const baseScore = 1 - relativeDiff;
    const comboBonus = invoiceCount > 1 ? 0.1 : 0;
    return Number(Math.min(baseScore + comboBonus, 1).toFixed(2)) * 100;
  };

  const shouldInclude = (difference: number) => Math.abs(difference) <= tolerance;

  invoices.forEach((invoice) => {
    const difference = targetAmount - invoice.amount;
    if (!shouldInclude(difference)) {
      return;
    }

    registerSuggestion({
      invoices: [invoice],
      total_amount: Number(invoice.amount.toFixed(2)),
      difference: Number(difference.toFixed(2)),
      confidence: computeConfidence(difference, 1),
      reason: 'Similar single invoice amount',
    });
  });

  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < invoices.length; j++) {
      const combo = [invoices[i], invoices[j]];
      const total = combo.reduce((sum, invoice) => sum + invoice.amount, 0);
      const difference = targetAmount - total;

      if (!shouldInclude(difference)) {
        continue;
      }

      registerSuggestion({
        invoices: combo,
        total_amount: Number(total.toFixed(2)),
        difference: Number(difference.toFixed(2)),
        confidence: computeConfidence(difference, combo.length),
        reason: 'Potential multi-invoice combination',
      });
    }
  }

  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < invoices.length; j++) {
      for (let k = j + 1; k < invoices.length; k++) {
        const combo = [invoices[i], invoices[j], invoices[k]];
        const total = combo.reduce((sum, invoice) => sum + invoice.amount, 0);
        const difference = targetAmount - total;

        if (!shouldInclude(difference)) {
          continue;
        }

        registerSuggestion({
          invoices: combo,
          total_amount: Number(total.toFixed(2)),
          difference: Number(difference.toFixed(2)),
          confidence: computeConfidence(difference, combo.length),
          reason: 'Potential multi-invoice combination',
        });
      }
    }
  }

  return Array.from(suggestions.values())
    .sort((a, b) => {
      const diffComparison = Math.abs(a.difference) - Math.abs(b.difference);
      if (diffComparison !== 0) {
        return diffComparison;
      }
      return b.confidence - a.confidence;
    })
    .slice(0, 5);
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Internal server error';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get user's tenant_id
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
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
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
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
    if (req.method === "GET") {
      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select("*")
        .eq("tenant_id", profile.tenant_id)
        .order("payment_date", { ascending: false });

      if (paymentsError) {
        console.error("Error fetching payments:", paymentsError);
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
      }
    }

    if (!payment_id) {
      return new Response(JSON.stringify({ error: "payment_id is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    console.log(`Matching payment ${payment_id} (tenant: ${profile.tenant_id})`);

    // Fetch payment details filtered by tenant
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("*")
      .eq("payment_id", payment_id)
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (paymentError || !payment) {
      console.error("Error fetching payment:", paymentError);
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const paymentAmount = parseNumeric(payment.amount_received);

    // Load open invoices for suggestions and matching
    const { data: openInvoicesData, error: openInvoicesError } = await supabase
      .from('invoices')
      .select('invoice_id, invoice_number, amount, customer_id')
      .eq('status', 'open')
      .eq('tenant_id', profile.tenant_id);

    if (openInvoicesError) {
      console.error('Error fetching open invoices:', openInvoicesError);
      throw openInvoicesError;
    }

    const openInvoices: InvoiceSummary[] = (openInvoicesData || []).map((invoice) => ({
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      amount: parseNumeric(invoice.amount),
      customer_id: invoice.customer_id ?? null,
    }));

    let status: 'matched' | 'needs_review' = 'needs_review';
    let message = 'No exact invoice match found. Manual review required.';
    let matched_invoice_id: string | null = null;
    const exactMatches: InvoiceSummary[] = [];

    const exactMatch = openInvoices.find(
      (invoice) => Math.abs(invoice.amount - paymentAmount) < 0.01
    );

    if (exactMatch) {
      status = 'matched';
      message = `Payment successfully matched to invoice ${exactMatch.invoice_number}.`;
      matched_invoice_id = exactMatch.invoice_id;
      exactMatches.push(exactMatch);

      console.log(`Exact match found: ${exactMatch.invoice_number}`);

      const { error: invoiceUpdateError } = await supabase
        .from('invoices')
        .update({ status: 'paid' })
        .eq('invoice_id', exactMatch.invoice_id)
        .eq('tenant_id', profile.tenant_id);

      if (invoiceUpdateError) {
        console.error("Error updating invoice:", invoiceUpdateError);
        throw invoiceUpdateError;
      }
    } else {
      console.log("No exact match found - flagging for review");
    }

    const { error: paymentUpdateError } = await supabase
      .from('payments')
      .update({
        status,
        matched_invoice_id,
      })
      .eq('payment_id', payment_id)
      .eq('tenant_id', profile.tenant_id);

    if (paymentUpdateError) {
      console.error("Error updating payment:", paymentUpdateError);
      throw paymentUpdateError;
    }

    const partialMatches =
      status === 'matched'
        ? []
        : buildPartialMatches(
            openInvoices.filter((invoice) => invoice.invoice_id !== matched_invoice_id),
            paymentAmount
          );

    console.log('Payment matching completed:', status);

    return new Response(
      JSON.stringify({
        status,
        message,
        payment: {
          payment_id,
          amount_received: Number(paymentAmount.toFixed(2)),
          payment_date: payment.payment_date,
          status,
          matched_invoice_id,
        },
        exact_matches: exactMatches,
        partial_matches: partialMatches,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: unknown) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  } catch (error: unknown) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
