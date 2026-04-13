export default function SubmittedByMePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Submitted by me</h1>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Requests you submitted to Intake.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          All clear. Good time to review your impact data.
        </p>
      </div>
    </div>
  );
}
