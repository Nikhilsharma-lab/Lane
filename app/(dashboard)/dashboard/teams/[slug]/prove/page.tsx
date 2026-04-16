interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ProveGatePage({ params }: Props) {
  const { slug } = await params;
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Prove</h1>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Streams awaiting sign-off before dev handoff.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing waiting for prove right now.
        </p>
      </div>
    </div>
  );
}
