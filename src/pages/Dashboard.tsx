import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { DollarSign, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { InvoiceList } from "@/components/dashboard/InvoiceList";
import { RiskChart } from "@/components/dashboard/RiskChart";
import { RiskPanel } from "@/components/dashboard/RiskPanel";
import { NotificationCenter } from "@/components/dashboard/NotificationCenter";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Invoice {
  id: string;
  customer: string;
  amount: number;
  dueDate: string;
  riskLevel: "high" | "medium" | "low";
  riskScore: number;
  daysOverdue: number;
  invoiceNumber: string;
  riskExplanation?: string;
}

const Dashboard = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [riskFilter, setRiskFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [dso, setDso] = useState<number>(42);
  const { toast } = useToast();

  useEffect(() => {
    fetchInvoices();
    fetchDSO();
  }, []);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in to view invoices",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('get-invoices', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      // Transform backend data to frontend format
      const transformedInvoices: Invoice[] = (data || []).map((inv: any) => {
        const dueDate = new Date(inv.due_date);
        const today = new Date();
        const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
        
        let riskLevel: "high" | "medium" | "low" = "low";
        if (inv.risk_score >= 70) riskLevel = "high";
        else if (inv.risk_score >= 40) riskLevel = "medium";

        return {
          id: inv.invoice_id,
          customer: inv.customer_name,
          amount: inv.amount,
          dueDate: inv.due_date,
          riskLevel,
          riskScore: inv.risk_score || 0,
          daysOverdue,
          invoiceNumber: inv.invoice_number,
          riskExplanation: inv.risk_explanation,
        };
      });

      setInvoices(transformedInvoices);
      
      // Automatically calculate risk for invoices without risk scores
      await calculateRisksForInvoices(transformedInvoices, session.access_token);
    } catch (error: any) {
      console.error('Error fetching invoices:', error);
      toast({
        title: "Error loading invoices",
        description: error.message || "Failed to fetch invoices",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateRisksForInvoices = async (invoiceList: Invoice[], accessToken: string) => {
    const invoicesNeedingRisk = invoiceList.filter(inv => inv.riskScore === 0 || !inv.riskExplanation);
    
    if (invoicesNeedingRisk.length === 0) return;

    console.log(`Calculating risk for ${invoicesNeedingRisk.length} invoices...`);

    // Calculate risk for each invoice
    for (const invoice of invoicesNeedingRisk) {
      try {
        const { data, error } = await supabase.functions.invoke('predict-risk', {
          body: { invoice_id: invoice.id },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (error) throw error;

        if (data) {
          // Update the invoice in state
          setInvoices(prevInvoices => 
            prevInvoices.map(inv => 
              inv.id === invoice.id 
                ? {
                    ...inv,
                    riskScore: data.risk_score * 100,
                    riskExplanation: data.risk_explanation,
                    riskLevel: data.risk_score >= 0.7 ? "high" : data.risk_score >= 0.4 ? "medium" : "low"
                  }
                : inv
            )
          );
        }
      } catch (error) {
        console.error(`Error calculating risk for invoice ${invoice.id}:`, error);
      }
    }
  };

  const fetchDSO = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('calculate-dso', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (data && typeof data.dso === 'number') {
        setDso(data.dso);
      }
    } catch (error: any) {
      console.error('Error fetching DSO:', error);
      // Keep default value if error
    }
  };

  const totalAR = invoices.reduce((sum, inv) => sum + inv.amount, 0);
  const overduePercent = invoices.length > 0
    ? (invoices.filter(inv => inv.daysOverdue > 0).length / invoices.length) * 100 
    : 0;
  const avgRiskScore = invoices.length > 0
    ? invoices.reduce((sum, inv) => sum + inv.riskScore, 0) / invoices.length
    : 0;

  const filteredInvoices = riskFilter === "all" 
    ? invoices 
    : invoices.filter(inv => inv.riskLevel === riskFilter);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Mission Control
            </h1>
            <p className="text-muted-foreground mt-1">AI-Powered Accounts Receivable Management</p>
          </div>
          <NotificationCenter />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="p-6 bg-gradient-card shadow-card hover:shadow-elevated transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total AR Outstanding</p>
                <p className="text-3xl font-bold mt-2">${(totalAR / 1000).toFixed(0)}K</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-card hover:shadow-elevated transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Days Sales Outstanding</p>
                <p className="text-3xl font-bold mt-2">{dso}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-warning" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-card hover:shadow-elevated transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">% AR Overdue</p>
                <p className="text-3xl font-bold mt-2">{overduePercent.toFixed(0)}%</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-danger/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-danger" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-card shadow-card hover:shadow-elevated transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Risk Score</p>
                <p className="text-3xl font-bold mt-2">{avgRiskScore.toFixed(0)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-6 bg-gradient-card shadow-card">
            <h2 className="text-xl font-semibold mb-4">AR Portfolio by Risk</h2>
            <RiskChart 
              data={invoices} 
              onSegmentClick={setRiskFilter}
              activeFilter={riskFilter}
            />
          </Card>

          <div className="lg:col-span-2">
            <InvoiceList 
              invoices={filteredInvoices}
              onInvoiceClick={setSelectedInvoice}
            />
          </div>
        </div>
      </div>

      <RiskPanel 
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onRiskUpdated={(updatedInvoice) => {
          setInvoices(invoices.map(inv => 
            inv.id === updatedInvoice.id ? updatedInvoice : inv
          ));
          setSelectedInvoice(updatedInvoice);
        }}
      />
    </div>
  );
};

export default Dashboard;
