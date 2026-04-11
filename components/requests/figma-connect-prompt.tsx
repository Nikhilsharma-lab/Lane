// components/requests/figma-connect-prompt.tsx
export function FigmaConnectPrompt() {
  return (
    <div className="border rounded-lg px-4 py-3 bg-muted">
      <p className="text-sm text-foreground mb-0.5">Connect Figma to track design updates</p>
      <p className="text-xs text-muted-foreground mb-3">See version history and post-handoff alerts</p>
      <a
        href="/api/figma/oauth/connect"
        className="inline-flex items-center gap-1.5 text-xs bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary px-3 py-1.5 rounded-lg transition-colors"
      >
        Connect Figma →
      </a>
    </div>
  );
}
