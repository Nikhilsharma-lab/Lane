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

const authControl = { minHeight: "var(--control-height-md)", paddingBlock: 0, fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", borderRadius: "var(--button-radius-md)" };

/**
 * Plan item 2.11: Clerk's sign-in, sign-up and session-task cards in Lane's auth
 * column, so they read like the forgot and reset pages Lane draws itself.
 * Clerk's spacing unit becomes Lane's (its $N is then --space-N: the card's $8
 * heading-to-form gap and its form's $6 field gap match auth.module.css). The
 * title takes Lane's auth title tokens (auth.module.css .title), the subtitle
 * Lane's description with its --space-3 gap (Clerk's own column gap is $1),
 * and inputs and buttons are Arc's md Input and Button. The plan's 24px title
 * and 36px inputs predate the 2026-10-13 Supabase tokens and resolve to
 * --text-2xl and --control-height-md. Clerk keeps its copy, steps and footer.
 */
export const clerkEmbeddedAppearance = {
  variables: {
    ...clerkNeutralVariables,
    spacing: "calc(var(--sb-spacing) * 4)",
    fontSize: { xs: "var(--text-xs)", sm: "var(--text-xs)", md: "var(--text-sm)", lg: "var(--text-base)", xl: "var(--text-base)" },
    fontWeight: { normal: "var(--weight-normal)", medium: "var(--weight-medium)", semibold: "var(--weight-medium)", bold: "var(--weight-medium)" },
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full border-0 shadow-none bg-transparent",
    card: "w-full border-0 shadow-none bg-transparent p-0",
    headerTitle: { fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", lineHeight: "var(--leading-display)", letterSpacing: "var(--tracking-display)", fontWeight: "var(--sb-font-weight-semibold)" },
    headerSubtitle: { marginTop: "calc(var(--space-3) - var(--space-1))", color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: "var(--leading-body)" },
    formFieldInput: { minHeight: "var(--control-height-md)", paddingBlock: 0, fontSize: "var(--text-sm)", borderRadius: "var(--radius-control)" },
    formButtonPrimary: authControl,
    socialButtonsBlockButton: authControl,
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

const organizationControl = { minHeight: "var(--control-height-md)", paddingBlock: 0, fontSize: "var(--text-sm)", borderRadius: "var(--button-radius-md)" };

/**
 * Plan item 2.10: the Organization Profile modals opened from Settings → Members
 * and Workspace details. Lane's settings sections already choose the page
 * (Members opens Clerk's members page, Manage workspace its General page), so
 * Clerk's own navigation is hidden and each modal shows the one page asked for.
 * Clerk keeps the members table, every invitation flow, its page and form
 * titles, and all authorization. Type, control height, hairline colour
 * (Clerk's own row rules, recoloured in clerk-profile.module.css) and corners
 * come from Lane's tokens: the launch plan's 13px rows, 32px buttons and 0.5px
 * borders predate the 2026-10-13 Supabase tokens and resolve to Lane's row
 * type, control height and border width. Weights stop at medium (Arc: 400 and
 * 500 only). No column is added: no "Last seen". The user-profile modals keep
 * `clerkAccountAppearance` and their navigation.
 */
export const clerkOrganizationAppearance = {
  variables: {
    ...clerkNeutralVariables,
    fontSize: { xs: "var(--text-xs)", sm: "var(--text-xs)", md: "var(--text-sm)", lg: "var(--text-base)", xl: "var(--text-base)" },
    fontWeight: { normal: "var(--weight-normal)", medium: "var(--weight-medium)", semibold: "var(--weight-medium)", bold: "var(--weight-medium)" },
  },
  elements: {
    ...clerkAccountAppearance.elements,
    navbar: { display: "none" },
    navbarMobileMenuRow: { display: "none" },
    tableHeaderCell: { fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", color: "var(--text-secondary)" },
    tableBodyCell: { fontSize: "var(--text-sm)" },
    userPreviewMainIdentifierText: { fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)" },
    userPreviewSecondaryIdentifier: { fontSize: "var(--text-xs)" },
    membersPageInviteButton: organizationControl,
    formButtonPrimary: organizationControl,
    formButtonReset: { ...organizationControl, color: "var(--foreground)", "&:hover": { color: "var(--foreground)" } },
    profileSectionPrimaryButton: { ...organizationControl, color: "var(--foreground)", "&:hover": { color: "var(--foreground)" } },
    organizationProfileMembersSearchInput: { minHeight: "var(--control-height-md)", fontSize: "var(--text-sm)" },
    selectButton: { minHeight: "var(--control-height-sm)", fontSize: "var(--text-sm)" },
  },
};
