import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface Invoice {
  riskLevel: "high" | "medium" | "low";
  amount: number;
}

interface RiskChartProps {
  data: Invoice[];
  onSegmentClick: (risk: "high" | "medium" | "low") => void;
  activeFilter: string;
}

export const RiskChart = ({ data, onSegmentClick, activeFilter }: RiskChartProps) => {
  const chartData = [
    {
      name: "High Risk",
      value: data.filter(inv => inv.riskLevel === "high").reduce((sum, inv) => sum + inv.amount, 0),
      color: "hsl(var(--danger))",
      risk: "high" as const
    },
    {
      name: "Medium Risk",
      value: data.filter(inv => inv.riskLevel === "medium").reduce((sum, inv) => sum + inv.amount, 0),
      color: "hsl(var(--warning))",
      risk: "medium" as const
    },
    {
      name: "Low Risk",
      value: data.filter(inv => inv.riskLevel === "low").reduce((sum, inv) => sum + inv.amount, 0),
      color: "hsl(var(--success))",
      risk: "low" as const
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={5}
          dataKey="value"
          onClick={(data) => onSegmentClick(data.risk)}
          className="cursor-pointer"
        >
          {chartData.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.color}
              opacity={activeFilter === "all" || activeFilter === entry.risk ? 1 : 0.3}
              className="transition-opacity duration-300"
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => `$${value.toLocaleString()}`}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "var(--radius)",
          }}
        />
        <Legend 
          verticalAlign="bottom" 
          height={36}
          formatter={(value) => <span className="text-sm">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};
