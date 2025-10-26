import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Payment {
  payment_id: string;
  amount_received: number;
  payment_date: string;
  status: string;
  matched_invoice_id: string | null;
}

interface InvoiceMatch {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

interface PartialMatchSuggestion {
  invoices: InvoiceMatch[];
  totalAmount: number;
  difference: number;
  confidence: number;
  reason: string;
}

interface MatchResult {
  status: string;
  message: string;
  paymentId: string;
  paymentAmount?: number;
  paymentDate?: string;
  matchedInvoiceId: string | null;
  exactMatches: InvoiceMatch[];
  partialMatches: PartialMatchSuggestion[];
}

type MatchFunctionResponse = {
  status: string;
  message: string;
  payment?: {
    payment_id: string;
    amount_received: number | string;
    payment_date?: string;
    status: string;
    matched_invoice_id: string | null;
  };
  exact_matches?: Array<{
    invoice_id: string;
    invoice_number: string;
    amount: number | string;
  }>;
  partial_matches?: Array<{
    invoices: Array<{
      invoice_id: string;
      invoice_number: string;
      amount: number | string;
    }>;
    total_amount: number | string;
    difference: number | string;
    confidence: number | string;
    reason: string;
  }>;
};

const CashApplication = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [matchingPaymentId, setMatchingPaymentId] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const { toast } = useToast();

  const formatCurrency = (value?: number) => {
    if (value === undefined || Number.isNaN(value)) {
      return "-";
    }

    return value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const toNumber = (value?: number | string | null) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === "number") {
      return value;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Unexpected error occurred';

  const fetchPayments = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in to view payments",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke<Payment[]>('match-payments', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      setPayments(data ?? []);
    } catch (error: unknown) {
      console.error('Error fetching payments:', error);
      toast({
        title: "Error",
        description: "Failed to load payments",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleMatchPayment = async (paymentId: string) => {
    try {
      setMatchingPaymentId(paymentId);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke<MatchFunctionResponse>('match-payments', {
        body: { payment_id: paymentId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (data) {
        const normalizedResult: MatchResult = {
          status: data.status,
          message: data.message,
          paymentId,
          paymentAmount: toNumber(data?.payment?.amount_received),
          paymentDate: data?.payment?.payment_date,
          matchedInvoiceId: data?.payment?.matched_invoice_id ?? null,
          exactMatches: (data?.exact_matches || []).map((match) => ({
            invoiceId: match.invoice_id,
            invoiceNumber: match.invoice_number,
            amount: toNumber(match.amount) ?? 0,
          })),
          partialMatches: (data?.partial_matches || []).map((match) => ({
            invoices: (match?.invoices || []).map((invoice) => ({
              invoiceId: invoice.invoice_id,
              invoiceNumber: invoice.invoice_number,
              amount: toNumber(invoice.amount) ?? 0,
            })),
            totalAmount: toNumber(match.total_amount) ?? 0,
            difference: toNumber(match.difference) ?? 0,
            confidence: toNumber(match.confidence) ?? 0,
            reason: match.reason,
          })),
        };

        setMatchResult(normalizedResult);
        setIsResultDialogOpen(true);

        toast({
          title: data.status === 'matched' ? "Match complete" : "Manual review suggested",
          description: data.message || "Payment processed",
        });
      }

      // Refresh payments list
      await fetchPayments();
      } catch (error: unknown) {
        console.error('Error matching payment:', error);
        toast({
          title: "Error",
          description: getErrorMessage(error) || "Failed to match payment",
          variant: "destructive",
        });
    } finally {
      setMatchingPaymentId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Cash Application
          </h1>
          <p className="text-muted-foreground mt-1">Payment Records</p>
        </div>

        {isLoading ? (
          <Card className="p-8 bg-gradient-card shadow-card">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading payments...</p>
            </div>
          </Card>
        ) : (
          <Card className="bg-gradient-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment ID</TableHead>
                  <TableHead>Amount Received</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Matched Invoice</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No payments found
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((payment) => (
                    <TableRow key={payment.payment_id}>
                      <TableCell className="font-medium">{payment.payment_id.slice(0, 8)}...</TableCell>
                      <TableCell>${parseFloat(payment.amount_received.toString()).toLocaleString()}</TableCell>
                      <TableCell>{new Date(payment.payment_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          payment.status === 'matched'
                            ? 'bg-success/10 text-success'
                            : payment.status === 'unmatched'
                            ? 'bg-warning/10 text-warning'
                            : 'bg-muted/10 text-muted-foreground'
                        }`}>
                          {payment.status}
                        </span>
                      </TableCell>
                      <TableCell>{payment.matched_invoice_id ? payment.matched_invoice_id.slice(0, 8) + '...' : '-'}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMatchPayment(payment.payment_id)}
                          disabled={matchingPaymentId === payment.payment_id || payment.status === 'matched'}
                        >
                          {matchingPaymentId === payment.payment_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Match
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
      <Dialog open={isResultDialogOpen} onOpenChange={setIsResultDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Payment match results</DialogTitle>
            <DialogDescription>
              {matchResult
                ? [
                    `Payment ${matchResult.paymentId.slice(0, 8)}...`,
                    formatCurrency(matchResult.paymentAmount),
                    matchResult.paymentDate
                      ? new Date(matchResult.paymentDate).toLocaleDateString()
                      : undefined,
                  ]
                    .filter((part): part is string => Boolean(part))
                    .join(' • ')
                : 'Review auto-matched and suggested invoices.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Fully matched invoices</h3>
                <p className="text-sm text-muted-foreground">Matches automatically linked to this payment.</p>
              </div>
              <div className="space-y-3">
                {matchResult?.exactMatches.length ? (
                  matchResult.exactMatches.map((invoice) => (
                    <Card key={invoice.invoiceId} className="border-success/40">
                      <div className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{invoice.invoiceNumber}</span>
                          <span className="text-sm font-semibold text-success">{formatCurrency(invoice.amount)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Invoice ID: {invoice.invoiceId.slice(0, 8)}...</p>
                      </div>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <div className="p-4 text-sm text-muted-foreground">No automatic matches were found for this payment.</div>
                  </Card>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Suggested for manual matching</h3>
                <p className="text-sm text-muted-foreground">Potential invoice combinations ranked by similarity for analyst review.</p>
              </div>
              <div className="space-y-3">
                {matchResult?.partialMatches.length ? (
                  matchResult.partialMatches.map((suggestion, index) => (
                    <Card key={index} className="border-primary/40">
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">{suggestion.reason}</span>
                          <span className="text-xs font-semibold text-primary">Confidence {Math.round(suggestion.confidence)}%</span>
                        </div>
                        <div className="space-y-2">
                          {suggestion.invoices.map((invoice) => (
                            <div key={invoice.invoiceId} className="flex items-center justify-between text-sm">
                              <span>{invoice.invoiceNumber}</span>
                              <span className="font-medium">{formatCurrency(invoice.amount)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="text-muted-foreground">Total</div>
                          <div className="font-semibold">{formatCurrency(suggestion.totalAmount)}</div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Variance</span>
                          <span>
                            {suggestion.difference === 0
                              ? 'Exact amount'
                              : suggestion.difference > 0
                              ? `${formatCurrency(suggestion.difference)} remaining`
                              : `${formatCurrency(Math.abs(suggestion.difference))} over`}
                          </span>
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <div className="p-4 text-sm text-muted-foreground">No close invoice combinations were identified. Consider manual reconciliation.</div>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CashApplication;
