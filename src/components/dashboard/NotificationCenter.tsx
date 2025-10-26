import { useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const notifications = [
  {
    id: 1,
    type: "high-risk",
    title: "High-Risk Invoice Detected",
    description: "Metro Solutions invoice flagged with 91% risk score",
    time: "2 minutes ago",
    unread: true
  },
  {
    id: 2,
    type: "dispute",
    title: "New Dispute Case Created",
    description: "Short payment of $5,000 from Acme Corporation",
    time: "15 minutes ago",
    unread: true
  },
  {
    id: 3,
    type: "payment",
    title: "Payment Auto-Cleared",
    description: "Successfully matched 12 payments totaling $245K",
    time: "1 hour ago",
    unread: false
  },
];

export const NotificationCenter = () => {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter(n => n.unread).length;

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge 
            className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 bg-danger text-danger-foreground"
          >
            {unreadCount}
          </Badge>
        )}
      </Button>

      {isOpen && (
        <Card className="absolute right-0 top-14 w-96 shadow-elevated z-50 animate-scale-in">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold">Notifications</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 border-b border-border hover:bg-muted/50 transition-colors cursor-pointer ${
                  notification.unread ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`h-2 w-2 rounded-full mt-2 flex-shrink-0 ${
                    notification.unread ? "bg-primary" : "bg-muted"
                  }`} />
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{notification.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {notification.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {notification.time}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
