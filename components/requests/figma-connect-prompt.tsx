// components/requests/figma-connect-prompt.tsx
export function FigmaConnectPrompt() {
  return (
    <div className="border border-zinc-800 rounded-lg px-4 py-3 bg-zinc-900/50">
      <p className="text-sm text-zinc-300 mb-0.5">Connect Figma to track design updates</p>
      <p className="text-xs text-zinc-500 mb-3">See version history and post-handoff alerts</p>
      <a
        href="/api/figma/oauth/connect"
        className="inline-flex items-center gap-1.5 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 px-3 py-1.5 rounded-lg transition-colors"
      >
        Connect Figma →
      </a>
    </div>
  );
}
