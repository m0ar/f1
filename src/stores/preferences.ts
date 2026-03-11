import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RaceRange } from "@/components/chart-range-filter";

interface PreferencesState {
  theme: "light" | "dark";
  selectedYear: number;
  chartRaceRange: RaceRange;
  _hasHydrated: boolean;
  // DEV: Simulate live race for testing
  simulateLive: boolean;
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;
  setSelectedYear: (year: number) => void;
  setChartRaceRange: (range: RaceRange) => void;
  setHasHydrated: (state: boolean) => void;
  setSimulateLive: (simulate: boolean) => void;
  toggleSimulateLive: () => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "light",
      selectedYear: 2025, // Default to 2025 since it has data
      chartRaceRange: "all" as RaceRange,
      _hasHydrated: false,
      simulateLive: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
      setSelectedYear: (year) => set({ selectedYear: year }),
      setChartRaceRange: (range) => set({ chartRaceRange: range }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      setSimulateLive: (simulate) => set({ simulateLive: simulate }),
      toggleSimulateLive: () =>
        set((state) => ({ simulateLive: !state.simulateLive })),
    }),
    {
      name: "f1-betting-preferences",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      // Don't persist simulateLive - it's a dev feature
      partialize: (state) => ({
        theme: state.theme,
        selectedYear: state.selectedYear,
        chartRaceRange: state.chartRaceRange,
      }),
    }
  )
);

// Hook to check if store has hydrated
export const useHasHydrated = () => usePreferences((state) => state._hasHydrated);
