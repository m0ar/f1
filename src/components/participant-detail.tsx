import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { ParticipantBet, RaceResult } from "@/types";

interface ParticipantDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participantName: string;
  bet: ParticipantBet;
  raceResult: RaceResult | null;
}

export function ParticipantDetail({
  open,
  onOpenChange,
  participantName,
  bet,
  raceResult,
}: ParticipantDetailProps) {
  const hasRaceData = !!raceResult;

  const driverStandings = raceResult?.driverStandings.map((d) => ({
    name: `${d.driver_first_name} ${d.driver_last_name}`,
    position: d.position,
    points: d.points,
  })) ?? [];

  const teamStandings = raceResult?.teamStandings.map((t) => ({
    name: t.team_name,
    position: t.position,
    points: t.points,
  })) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[calc(100%-2rem)] sm:max-w-4xl max-h-[85vh] flex flex-col p-4 sm:p-6 overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg sm:text-xl">{participantName}'s Predictions</DialogTitle>
          <DialogDescription className="text-sm">
            {hasRaceData
              ? `Comparing predictions to actual standings after ${raceResult.circuitName}`
              : "Season has not started yet. Showing predicted order."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 sticky top-0 bg-background py-1">Driver Predictions</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 sm:w-14">#</TableHead>
                  <TableHead>Driver</TableHead>
                  {hasRaceData && (
                    <>
                      <TableHead className="w-12 sm:w-14 text-center">Act</TableHead>
                      <TableHead className="w-14 sm:w-16">Diff</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bet.drivers.map((driver, index) => {
                  const predicted = index + 1;
                  const actual = driverStandings.find(
                    (d) => d.name.toLowerCase() === driver.toLowerCase()
                  );
                  const actualPos = actual?.position ?? driverStandings.length + 1;
                  const diff = predicted - actualPos;

                  return (
                    <TableRow key={driver}>
                      <TableCell className="font-medium">{predicted}</TableCell>
                      <TableCell className="truncate max-w-[100px] sm:max-w-none">{driver}</TableCell>
                      {hasRaceData && (
                        <>
                          <TableCell className="text-center">{actual ? actualPos : "N/A"}</TableCell>
                          <TableCell>
                            <DiffBadge diff={diff} />
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div>
            <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 sticky top-0 bg-background py-1">Constructor Predictions</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 sm:w-14">#</TableHead>
                  <TableHead>Constructor</TableHead>
                  {hasRaceData && (
                    <>
                      <TableHead className="w-12 sm:w-14 text-center">Act</TableHead>
                      <TableHead className="w-14 sm:w-16">Diff</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bet.constructors.map((constructor, index) => {
                  const predicted = index + 1;
                  const actual = teamStandings.find(
                    (t) => t.name.toLowerCase() === constructor.toLowerCase()
                  );
                  const actualPos = actual?.position ?? teamStandings.length + 1;
                  const diff = predicted - actualPos;

                  return (
                    <TableRow key={constructor}>
                      <TableCell className="font-medium">{predicted}</TableCell>
                      <TableCell className="truncate max-w-[100px] sm:max-w-none">{constructor}</TableCell>
                      {hasRaceData && (
                        <>
                          <TableCell className="text-center">{actual ? actualPos : "N/A"}</TableCell>
                          <TableCell>
                            <DiffBadge diff={diff} />
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiffBadge({ diff }: { diff: number }) {
  if (diff === 0) {
    return (
      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
        <Minus className="h-3 w-3 mr-1" />0
      </Badge>
    );
  }

  if (diff > 0) {
    // Predicted lower (better) than actual - this is bad (overestimated)
    return (
      <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
        <ArrowDown className="h-3 w-3 mr-1" />
        {Math.abs(diff)}
      </Badge>
    );
  }

  // Predicted higher (worse) than actual - underestimated
  return (
    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
      <ArrowUp className="h-3 w-3 mr-1" />
      {Math.abs(diff)}
    </Badge>
  );
}
