// Clerk's documented appearance variables resolve directly to Arc default tokens.
// https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/variables
export const clerkNeutralVariables = {
  colorPrimary: "var(--foreground)",
  colorPrimaryForeground: "var(--background)",
  colorForeground: "var(--foreground)",
  colorMutedForeground: "var(--text-secondary)",
  colorBackground: "var(--surface)",
  colorInput: "var(--surface)",
  colorInputForeground: "var(--foreground)",
  colorBorder: "var(--border)",
  colorMuted: "var(--surface-muted)",
  colorRing: "var(--focus-ring)",
  colorDanger: "var(--danger)",
  colorNeutral: "var(--foreground)",
  fontFamily: "var(--font-body)",
  borderRadius: "var(--radius-control)",
};

export const clerkEmbeddedAppearance = {
  variables: clerkNeutralVariables,
  elements: {
    rootBox: "w-full",
    cardBox: "w-full border-0 shadow-none bg-transparent",
    card: "w-full border-0 shadow-none bg-transparent p-0",
  },
};
