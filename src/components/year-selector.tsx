import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePreferences } from "@/stores/preferences";

const AVAILABLE_YEARS = [2024, 2025, 2026];

export function YearSelector() {
  const { selectedYear, setSelectedYear } = usePreferences();

  return (
    <Select
      value={selectedYear.toString()}
      onValueChange={(value) => setSelectedYear(parseInt(value, 10))}
    >
      <SelectTrigger className="w-[80px] sm:w-[100px]">
        <SelectValue placeholder="Year" />
      </SelectTrigger>
      <SelectContent>
        {AVAILABLE_YEARS.map((year) => (
          <SelectItem key={year} value={year.toString()}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
