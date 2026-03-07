import type { Bets } from "@/types";
import bets2025 from "@/data/bets_2025.json";
import bets2026 from "@/data/bets_2026.json";

const betsByYear: Record<number, Bets> = {
  2025: bets2025 as Bets,
  2026: bets2026 as Bets,
};

export function getBetsForYear(year: number): Bets {
  return betsByYear[year] || {};
}

export function getAvailableYears(): number[] {
  return Object.keys(betsByYear).map(Number).sort();
}
