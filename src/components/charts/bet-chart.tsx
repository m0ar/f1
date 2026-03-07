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
import type { BetChartDataPoint } from "@/types";

// Color palette for participants
const PARTICIPANT_COLORS = [
  "#e11d48", // rose-600
  "#2563eb", // blue-600
  "#16a34a", // green-600
  "#9333ea", // purple-600
  "#ea580c", // orange-600
  "#0891b2", // cyan-600
  "#c026d3", // fuchsia-600
  "#65a30d", // lime-600
];

interface BetChartProps {
  data: BetChartDataPoint[];
  participants: string[];
  title: string;
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
    // Sort descending (lower score is better, shown at top)
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

export function BetChart({ data, participants, title }: BetChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[250px] sm:h-[300px] md:h-[400px] items-center justify-center text-muted-foreground">
        No data available
      </div>
    );
  }

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
            {participants.map((participant, index) => (
              <Line
                key={participant}
                type="monotone"
                dataKey={participant}
                stroke={PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length]}
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
