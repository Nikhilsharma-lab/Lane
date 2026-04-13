interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ActiveStreamsPage({ params }: Props) {
  const { slug } = await params;
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Active streams</h1>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Streams currently in progress for this team.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          No active streams yet.
        </p>
      </div>
    </div>
  );
}
