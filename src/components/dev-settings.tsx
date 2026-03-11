import { useState } from "react";
import { Settings, X, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/stores/preferences";

export function DevSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const simulateLive = usePreferences((state) => state.simulateLive);
  const toggleSimulateLive = usePreferences((state) => state.toggleSimulateLive);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen && (
        <div className="absolute bottom-12 right-0 w-64 p-4 bg-background border rounded-lg shadow-lg mb-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Dev Settings</h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant={simulateLive ? "destructive" : "outline"}
            size="sm"
            className="w-full justify-start gap-2"
            onClick={toggleSimulateLive}
          >
            <Radio className="h-4 w-4" />
            {simulateLive ? "Live Mode ON" : "Simulate Live Race"}
          </Button>
          {simulateLive && (
            <p className="text-xs text-muted-foreground mt-2">
              Polling every 10s with random position swaps
            </p>
          )}
        </div>
      )}
      <Button
        variant="outline"
        size="icon"
        className={`rounded-full shadow-lg opacity-50 hover:opacity-100 transition-opacity ${
          simulateLive ? "ring-2 ring-red-500 opacity-100" : ""
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Settings className={`h-4 w-4 ${simulateLive ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
