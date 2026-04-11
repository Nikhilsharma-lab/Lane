import { Card, CardContent } from "@/components/ui/card";

export default function DraftsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Drafts</h1>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Requests you started but haven&apos;t submitted yet.
        </p>
      </div>
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground/60">
            No drafts. Start a new request when you&apos;re ready.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
