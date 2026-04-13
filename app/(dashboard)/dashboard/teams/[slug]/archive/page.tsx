interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ArchivePage({ params }: Props) {
  const { slug } = await params;
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Archive</h1>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Completed and shipped streams.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No archived streams yet. Shipped work appears here.
        </p>
      </div>
    </div>
  );
}
