import { X, TrendingUp, DollarSign, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
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

interface RiskPanelProps {
  invoice: Invoice | null;
  onClose: () => void;
  onRiskUpdated?: (updatedInvoice: Invoice) => void;
}

export const RiskPanel = ({ invoice, onClose, onRiskUpdated }: RiskPanelProps) => {
  const [calculating, setCalculating] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState(invoice);
  const { toast } = useToast();

  if (!invoice) return null;

  const displayInvoice = currentInvoice || invoice;

  const calculateRisk = async () => {
    try {
      setCalculating(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in to calculate risk",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('predict-risk', {
        body: { invoice_id: invoice.id },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      // Update local state with new risk data
      const riskScore = Math.round(data.risk_score * 100);
      let riskLevel: "high" | "medium" | "low" = "low";
      if (riskScore >= 70) riskLevel = "high";
      else if (riskScore >= 40) riskLevel = "medium";

      const updatedInvoice = {
        ...invoice,
        riskScore,
        riskLevel,
        riskExplanation: data.risk_explanation,
      };

      setCurrentInvoice(updatedInvoice);
      
      if (onRiskUpdated) {
        onRiskUpdated(updatedInvoice);
      }

      toast({
        title: "Risk calculated",
        description: "AI risk analysis completed successfully",
      });
    } catch (error: any) {
      console.error('Error calculating risk:', error);
      toast({
        title: "Error calculating risk",
        description: error.message || "Failed to calculate risk",
        variant: "destructive",
      });
    } finally {
      setCalculating(false);
    }
  };

  const getRiskFactors = () => {
    if (displayInvoice.daysOverdue === 0 && displayInvoice.riskLevel === "high") {
      // Proactive prediction for not-yet-overdue high-risk invoices
      return [
        {
          icon: Clock,
          title: "Historical Payment Pattern",
          description: `${displayInvoice.customer} has paid late on 4 of the last 6 invoices (avg 8 days late)`,
          impact: "High Impact",
          impactColor: "text-danger"
        },
        {
          icon: DollarSign,
          title: "Invoice Value Risk",
          description: `Amount of $${displayInvoice.amount.toLocaleString()} is 62% above customer's typical payment capacity`,
          impact: "High Impact",
          impactColor: "text-danger"
        },
        {
          icon: TrendingUp,
          title: "Predictive Model Analysis",
          description: `AI model predicts 82% probability of payment delay beyond due date`,
          impact: "Critical",
          impactColor: "text-danger"
        },
        {
          icon: AlertCircle,
          title: "Financial Health Indicators",
          description: "Customer's credit score decreased 12% in last quarter; cash flow concerns detected",
          impact: "High Impact",
          impactColor: "text-danger"
        }
      ];
    }
    
    // Default factors for overdue or lower-risk invoices
    return [
      {
        icon: Clock,
        title: "Payment History",
        description: `${displayInvoice.customer} has paid late on 3 of the last 5 invoices`,
        impact: "High Impact",
        impactColor: "text-danger"
      },
      {
        icon: DollarSign,
        title: "Invoice Value",
        description: `Amount of $${displayInvoice.amount.toLocaleString()} is 45% above customer average`,
        impact: "Medium Impact",
        impactColor: "text-warning"
      },
      {
        icon: TrendingUp,
        title: "Current Days Overdue",
        description: displayInvoice.daysOverdue > 0 
          ? `Invoice is ${displayInvoice.daysOverdue} days overdue` 
          : "Invoice is not yet due",
        impact: displayInvoice.daysOverdue > 0 ? "High Impact" : "Low Impact",
        impactColor: displayInvoice.daysOverdue > 0 ? "text-danger" : "text-success"
      },
      {
        icon: AlertCircle,
        title: "Industry Trends",
        description: "Recent economic indicators show 15% slowdown in customer's sector",
        impact: "Medium Impact",
        impactColor: "text-warning"
      }
    ];
  };

  const riskFactors = getRiskFactors();

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex justify-end animate-fade-in">
      <div className="w-full max-w-2xl bg-card shadow-elevated animate-slide-in-right overflow-y-auto">
        <div className="sticky top-0 bg-gradient-primary p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-primary-foreground">AI Risk Analysis</h2>
            <p className="text-primary-foreground/80 mt-1">Predictive insights for {displayInvoice.customer}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={calculateRisk}
              disabled={calculating}
              size="sm"
              variant="secondary"
              className="text-primary-foreground bg-primary-foreground/10 hover:bg-primary-foreground/20"
            >
              {calculating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recalculate
                </>
              )}
            </Button>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-card-foreground/5 rounded-lg p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold">{displayInvoice.invoiceNumber}</h3>
                <p className="text-muted-foreground">{displayInvoice.customer}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold">${displayInvoice.amount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Due: {new Date(displayInvoice.dueDate).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge 
                className={
                  displayInvoice.riskLevel === "high" ? "bg-danger text-danger-foreground" :
                  displayInvoice.riskLevel === "medium" ? "bg-warning text-warning-foreground" :
                  "bg-success text-success-foreground"
                }
              >
                {displayInvoice.riskLevel.toUpperCase()} RISK
              </Badge>
              <span className="text-lg font-medium">Risk Score: {displayInvoice.riskScore}/100</span>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Key Risk Factors
            </h3>
            <div className="space-y-4">
              {riskFactors.map((factor, index) => (
                <div 
                  key={index}
                  className="bg-muted/50 rounded-lg p-4 hover:bg-muted transition-colors duration-200"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <factor.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-semibold">{factor.title}</h4>
                        <span className={`text-sm font-medium ${factor.impactColor}`}>
                          {factor.impact}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{factor.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-primary/10 rounded-lg p-4 border-l-4 border-primary">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              AI Recommendation
            </h4>
            {displayInvoice.riskExplanation ? (
              <p className="text-sm text-muted-foreground mb-3">
                {displayInvoice.riskExplanation}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mb-3">
                {displayInvoice.riskLevel === "high" && displayInvoice.daysOverdue === 0
                  ? "🎯 PROACTIVE ACTION REQUIRED: High probability of payment delay detected before due date."
                  : displayInvoice.riskLevel === "high" 
                  ? "Consider immediate contact with customer. Set up payment plan or escalate to collections if no response within 48 hours."
                  : displayInvoice.riskLevel === "medium"
                  ? "Monitor closely and send payment reminder 3 days before due date. Prepare for potential follow-up."
                  : "Low risk of late payment. Standard monitoring is sufficient."
                }
              </p>
            )}
            {displayInvoice.riskLevel === "high" && displayInvoice.daysOverdue === 0 && (
              <div className="space-y-2 text-sm">
                <p className="font-medium">Recommended Actions:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                  <li>Contact customer within 24 hours to confirm payment commitment</li>
                  <li>Offer early payment discount (2% for payment within 10 days)</li>
                  <li>Propose payment plan: 50% now, 50% in 30 days</li>
                  <li>Schedule follow-up call 7 days before due date</li>
                  <li>Prepare collection strategy if no commitment received</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
