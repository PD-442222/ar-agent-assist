import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type DisputeStatus = "new" | "in-review" | "awaiting-customer" | "resolved";

interface Dispute {
  dispute_id: string;
  status: DisputeStatus;
  disputed_amount: number;
  reason: string | null;
  created_at: string;
  invoice_id: string;
  invoice_number: string;
  invoice_amount: number;
  customer_name: string;
}

const DisputeManagement = () => {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchDisputes();
  }, []);

  const normalizeStatus = (status: string): DisputeStatus => {
    const normalized = status.toLowerCase().replace(/_/g, "-");
    switch (normalized) {
      case "in-review":
        return "in-review";
      case "awaiting-customer":
        return "awaiting-customer";
      case "resolved":
        return "resolved";
      default:
        return "new";
    }
  };

  const fetchDisputes = async () => {
    try {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in to view disputes",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('disputes', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      const normalizedDisputes: Dispute[] = (data || []).map((dispute: any) => ({
        ...dispute,
        status: normalizeStatus(dispute.status),
      }));

      setDisputes(normalizedDisputes);
    } catch (error: any) {
      console.error('Error fetching disputes:', error);
      toast({
        title: "Error",
        description: "Failed to load disputes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: DisputeStatus) => {
    switch (status) {
      case "new":
        return "bg-danger text-danger-foreground";
      case "in-review":
        return "bg-warning text-warning-foreground";
      case "awaiting-customer":
        return "bg-primary text-primary-foreground";
      case "resolved":
        return "bg-success text-success-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: DisputeStatus) => {
    return status.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  };

  const groupedDisputes = {
    new: disputes.filter(d => d.status === "new"),
    "in-review": disputes.filter(d => d.status === "in-review"),
    "awaiting-customer": disputes.filter(d => d.status === "awaiting-customer"),
    resolved: disputes.filter(d => d.status === "resolved"),
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6 space-y-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Dispute Management
            </h1>
            <p className="text-muted-foreground mt-1">Track and resolve payment discrepancies</p>
          </div>
          <Card className="p-8 bg-gradient-card shadow-card">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading disputes...</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Dispute Management
          </h1>
          <p className="text-muted-foreground mt-1">Track and resolve payment discrepancies</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Object.entries(groupedDisputes).map(([status, items]) => {
            const typedStatus = status as DisputeStatus;
            return (
              <div key={status} className="space-y-3">
                <Card className="p-4 bg-gradient-card shadow-card">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{getStatusLabel(typedStatus)}</h3>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                </Card>

                <div className="space-y-3">
                  {items.length === 0 ? (
                    <Card className="p-4 bg-card shadow-card">
                      <p className="text-sm text-muted-foreground text-center">No disputes</p>
                    </Card>
                  ) : (
                    items.map((dispute) => (
                      <Card
                        key={dispute.dispute_id}
                        className="p-4 bg-card shadow-card hover:shadow-elevated transition-all duration-300 cursor-move"
                        draggable
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">{dispute.dispute_id.slice(0, 13)}...</span>
                            <Badge className={getStatusColor(dispute.status)} variant="secondary">
                              {getStatusLabel(dispute.status)}
                            </Badge>
                          </div>

                          <div>
                            <p className="font-semibold">{dispute.customer_name}</p>
                            <p className="text-sm text-muted-foreground">{dispute.invoice_number}</p>
                          </div>

                          <div className="bg-danger-muted rounded-lg p-3">
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Invoice Amount:</span>
                              <span className="font-medium">${parseFloat(dispute.invoice_amount.toString()).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm pt-2 border-t border-danger">
                              <span className="font-semibold">Disputed Amount:</span>
                              <span className="font-bold text-danger">${parseFloat(dispute.disputed_amount.toString()).toLocaleString()}</span>
                            </div>
                          </div>

                          {dispute.reason && (
                            <div className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                              <div className="flex items-start gap-2">
                                <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>{dispute.reason}</span>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="flex-1">
                              <FileText className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Button size="sm" className="flex-1 bg-gradient-primary">
                              Update
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DisputeManagement;
