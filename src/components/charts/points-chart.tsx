import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { PointsChartDataPoint, EntityColorMap } from "@/types";

// Fallback colors when API colors are not available
const FALLBACK_COLORS = [
  "#e11d48",
  "#2563eb",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#c026d3",
  "#65a30d",
  "#dc2626",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#0284c7",
  "#db2777",
  "#4f46e5",
  "#84cc16",
  "#f59e0b",
  "#10b981",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
];

interface PointsChartProps {
  data: PointsChartDataPoint[];
  entities: string[];
  title: string;
  colors?: EntityColorMap;
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const sorted = [...payload].sort((a, b) => {
    // Sort descending (higher points is better)
    if (a.value !== b.value) return b.value - a.value;
    return a.name.localeCompare(b.name);
  });

  return (
    <div
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        fontSize: "12px",
        padding: "8px 12px",
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
      }}
    >
      <p style={{ color: "var(--foreground)", fontWeight: "bold", marginBottom: "4px" }}>
        {label}
      </p>
      {sorted.map((entry) => (
        <div key={entry.dataKey} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "2px 0" }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: entry.color,
              flexShrink: 0,
            }}
          />
          <span style={{ color: "var(--foreground)" }}>
            {entry.name}: {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PointsChart({ data, entities, title, colors }: PointsChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[250px] sm:h-[300px] md:h-[400px] items-center justify-center text-muted-foreground">
        No data available
      </div>
    );
  }

  const getColor = (entity: string, index: number) => {
    // Use API color if available (prefixed with #), otherwise fallback
    if (colors?.[entity]) {
      return `#${colors[entity]}`;
    }
    return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  };

  return (
    <div className="w-full">
      <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">{title}</h3>
      <div className="h-[250px] sm:h-[300px] md:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="race"
              tick={{ fontSize: 10 }}
              className="text-muted-foreground"
              angle={-45}
              textAnchor="end"
              height={90}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              className="text-muted-foreground"
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              wrapperStyle={{ fontSize: "12px", paddingBottom: "10px" }}
            />
            {entities.map((entity, index) => (
              <Line
                key={entity}
                type="monotone"
                dataKey={entity}
                stroke={getColor(entity, index)}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
