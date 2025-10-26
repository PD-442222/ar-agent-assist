import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

const CashApplication = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [matchingPaymentId, setMatchingPaymentId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
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

      const { data, error } = await supabase.functions.invoke('match-payments', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      setPayments(data || []);
    } catch (error: any) {
      console.error('Error fetching payments:', error);
      toast({
        title: "Error",
        description: "Failed to load payments",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

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

      const { data, error } = await supabase.functions.invoke('match-payments', {
        body: { payment_id: paymentId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: data.message || "Payment processed",
      });

      // Refresh payments list
      await fetchPayments();
    } catch (error: any) {
      console.error('Error matching payment:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to match payment",
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
    </div>
  );
};

export default CashApplication;
