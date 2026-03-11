import { Button } from "@/components/ui/button";

export type RaceRange = "all" | 3 | 5;

const RANGE_OPTIONS: { value: RaceRange; label: string }[] = [
  { value: "all", label: "All" },
  { value: 5, label: "Last 5" },
  { value: 3, label: "Last 3" },
];

interface ChartRangeFilterProps {
  value: RaceRange;
  onChange: (value: RaceRange) => void;
  totalRaces: number;
}

export function ChartRangeFilter({ value, onChange, totalRaces }: ChartRangeFilterProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm text-muted-foreground mr-2">Show:</span>
      {RANGE_OPTIONS.map((option) => {
        // Hide options that exceed total races (except "all")
        if (option.value !== "all" && option.value > totalRaces) {
          return null;
        }

        const isSelected = value === option.value;
        return (
          <Button
            key={option.value}
            variant={isSelected ? "default" : "outline"}
            size="xs"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export function sliceByRange<T>(data: T[], range: RaceRange): T[] {
  if (range === "all" || data.length <= range) {
    return data;
  }
  return data.slice(-range);
}
