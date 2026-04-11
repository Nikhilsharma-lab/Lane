import type { PublishedView, Request, Phase } from "@/db/schema";
import { getPhaseLabel, getStageLabel } from "@/lib/workflow";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

const PRIORITY_LABELS: Record<string, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

function getStage(r: Request): string {
  if (r.phase === "predesign") return getStageLabel(r.predesignStage ?? "intake");
  if (r.phase === "design") return getStageLabel(r.designStage ?? "sense");
  if (r.phase === "dev") return getStageLabel(r.kanbanState ?? "todo");
  if (r.phase === "track") return getStageLabel(r.trackStage ?? "measuring");
  return "";
}

interface Props {
  view: PublishedView;
  requests: Request[];
  isPublic: boolean;
}

export function PublishedViewPage({ view, requests, isPublic }: Props) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b px-8 py-6">
        <h1 className="text-xl font-bold text-foreground mb-1">
          {view.name}
        </h1>
        {view.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {view.description}
          </p>
        )}
        <p className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground mt-2">
          {requests.length} request{requests.length !== 1 ? "s" : ""}
          {isPublic ? " · Public view" : " · Team view"}
        </p>
      </header>

      {/* Table */}
      <main className="px-8 py-4 pb-12">
        {requests.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No requests match the current filters.
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[140px]">Phase / Stage</TableHead>
                  <TableHead className="w-[100px]">Priority</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium truncate max-w-[300px]">
                      {r.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[11px]">
                      {r.phase ? getPhaseLabel(r.phase as Phase) : ""} · {getStage(r)}
                    </TableCell>
                    <TableCell>
                      {r.priority ? (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {PRIORITY_LABELS[r.priority]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-[9px] uppercase text-muted-foreground">
                        {r.status.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Comments placeholder */}
        {view.allowComments && !isPublic && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="font-mono text-[9px] font-medium tracking-wider uppercase text-muted-foreground">
                Comments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Comments will appear here. This feature is coming soon.
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center px-8 py-4 pb-8 font-mono text-[10px] tracking-wider text-muted-foreground">
        Powered by Lane
      </footer>
    </div>
  );
}
