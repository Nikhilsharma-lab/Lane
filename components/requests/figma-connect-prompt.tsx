// components/requests/figma-connect-prompt.tsx
export function FigmaConnectPrompt() {
  return (
    <div className="border border-[var(--border)] rounded-lg px-4 py-3 bg-[var(--bg-subtle)]">
      <p className="text-sm text-[var(--text-primary)] mb-0.5">Connect Figma to track design updates</p>
      <p className="text-xs text-[var(--text-secondary)] mb-3">See version history and post-handoff alerts</p>
      <a
        href="/api/figma/oauth/connect"
        className="inline-flex items-center gap-1.5 text-xs bg-[var(--accent-subtle)] hover:bg-[var(--accent)]/20 border border-[var(--accent)]/20 text-[var(--accent)] px-3 py-1.5 rounded-lg transition-colors"
      >
        Connect Figma →
      </a>
    </div>
  );
}
