import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ImpactPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Impact</h1>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Predicted vs. actual impact across shipped work.
        </p>
      </div>
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground/60">
            Coming soon. Track how predictions compare to real outcomes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
