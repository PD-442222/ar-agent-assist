import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Invoice {
  id: string;
  customer: string;
  amount: number;
  dueDate: string;
  riskLevel: "high" | "medium" | "low";
  riskScore: number;
  daysOverdue: number;
  invoiceNumber: string;
}

interface InvoiceListProps {
  invoices: Invoice[];
  onInvoiceClick: (invoice: Invoice) => void;
}

export const InvoiceList = ({ invoices, onInvoiceClick }: InvoiceListProps) => {
  const getRiskColor = (level: string) => {
    switch (level) {
      case "high":
        return "bg-danger text-danger-foreground";
      case "medium":
        return "bg-warning text-warning-foreground";
      case "low":
        return "bg-success text-success-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case "high":
        return <TrendingUp className="h-4 w-4" />;
      case "medium":
        return <Minus className="h-4 w-4" />;
      case "low":
        return <TrendingDown className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <Card className="p-6 bg-gradient-card shadow-card">
      <h2 className="text-xl font-semibold mb-4">Open Invoices</h2>
      <div className="space-y-3">
        {invoices.map((invoice) => (
          <Card
            key={invoice.id}
            className="p-4 cursor-pointer hover:shadow-elevated transition-all duration-300 bg-card border-l-4"
            style={{
              borderLeftColor: invoice.riskLevel === "high" 
                ? "hsl(var(--danger))" 
                : invoice.riskLevel === "medium" 
                ? "hsl(var(--warning))" 
                : "hsl(var(--success))"
            }}
            onClick={() => onInvoiceClick(invoice)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-lg">{invoice.customer}</h3>
                  <Badge className={getRiskColor(invoice.riskLevel)} variant="secondary">
                    <span className="flex items-center gap-1">
                      {getRiskIcon(invoice.riskLevel)}
                      {invoice.riskLevel.toUpperCase()}
                    </span>
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{invoice.invoiceNumber}</span>
                  <span>Due: {new Date(invoice.dueDate).toLocaleDateString()}</span>
                  {invoice.daysOverdue > 0 && (
                    <span className="text-danger font-medium">
                      {invoice.daysOverdue} days overdue
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">${invoice.amount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Risk Score: {invoice.riskScore}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Card>
  );
};
