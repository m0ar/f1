import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PreferencesState {
  theme: "light" | "dark";
  selectedYear: number;
  _hasHydrated: boolean;
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;
  setSelectedYear: (year: number) => void;
  setHasHydrated: (state: boolean) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "light",
      selectedYear: 2025, // Default to 2025 since it has data
      _hasHydrated: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
      setSelectedYear: (year) => set({ selectedYear: year }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: "f1-betting-preferences",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// Hook to check if store has hydrated
export const useHasHydrated = () => usePreferences((state) => state._hasHydrated);
