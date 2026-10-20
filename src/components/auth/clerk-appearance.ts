import styles from "./clerk-profile.module.css";

// Clerk's documented appearance variables resolve directly to Lane's Supabase-backed tokens.
// https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/variables
export const clerkNeutralVariables = {
  colorPrimary: "var(--primary-background)",
  colorPrimaryForeground: "var(--primary-label)",
  colorForeground: "var(--foreground)",
  colorMutedForeground: "var(--text-secondary)",
  colorBackground: "var(--surface)",
  colorInput: "var(--input-background)",
  colorInputForeground: "var(--foreground)",
  colorBorder: "var(--border)",
  colorMuted: "var(--surface-muted)",
  colorRing: "var(--focus-outline)",
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

// Clerk's profile navbar is translucent by default. Give the complete modal an
// opaque base so navigation and muted text cannot blend with the page behind it.
export const clerkAccountAppearance = {
  variables: clerkNeutralVariables,
  elements: {
    cardBox: { backgroundColor: "var(--surface)", borderRadius: "var(--radius-surface)" },
    navbar: { backgroundColor: "var(--surface-muted)" },
    navbarButton: styles.action,
    profileSectionPrimaryButton: styles.action,
    formButtonReset: styles.action,
    tabButton: styles.action,
    badge: { color: "var(--text-secondary)", backgroundColor: "var(--surface-muted)", borderColor: "var(--border)" },
    profilePage__organizationMembers: styles.membersPage,
    table: styles.table,
  },
};
