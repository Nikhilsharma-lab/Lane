import styles from "./clerk-profile.module.css";

// Clerk's documented appearance variables resolve directly to the theme file (src/styles/theme.css):
// all 17 colour keys read a tweakcn slot or a Lane addition, so no Clerk default colour paints.
// Success, warning, the modal backdrop, the avatar shimmer (Lane's skeleton fill) and the shadow
// follow Lane's own tokens in light and dark (#93).
// https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/variables
export const clerkNeutralVariables = {
  colorPrimary: "var(--primary)",
  colorPrimaryForeground: "var(--primary-foreground)",
  colorForeground: "var(--foreground)",
  colorMutedForeground: "var(--muted-foreground)",
  colorBackground: "var(--card)",
  colorInput: "var(--input-background)",
  colorInputForeground: "var(--foreground)",
  colorBorder: "var(--border)",
  colorMuted: "var(--surface-muted)",
  colorRing: "var(--focus-outline)",
  colorDanger: "var(--destructive)",
  colorNeutral: "var(--foreground)",
  colorSuccess: "var(--success)",
  colorWarning: "var(--warning)",
  colorShimmer: "var(--hairline)",
  colorModalBackdrop: "var(--overlay-backdrop)",
  colorShadow: "var(--shadow-color)",
  fontFamily: "var(--font-sans)",
  fontFamilyButtons: "var(--font-sans)",
  borderRadius: "var(--radius-control)",
};

// Clerk paints links with colorPrimary, the button plate, which is about 2.5:1 on a dark page.
// Sign-in links read Lane's link ink instead; the button keeps the plate (#93).
const authLink = { color: "var(--link-ink)", "&:hover": { color: "var(--link-ink)" } };

const authControl = {
  minHeight: "var(--control-height-md)", paddingBlock: 0, fontSize: "var(--text-sm)",
  fontWeight: "var(--weight-medium)", borderRadius: "var(--button-radius-md)",
  "@media (pointer: coarse)": { minHeight: "var(--size-inner-xlarge)" },
};

const controlFocus = { "&:focus, &:focus-visible, &:focus:not(:focus-visible)": { boxShadow: "none" } };
const inputFocus = { "&:focus-within, &[data-focus-within=true]": { boxShadow: "none", borderColor: "var(--input-border-hover)" } };

/**
 * Plan item 2.11: Clerk's sign-in, sign-up and session-task cards in Lane's auth
 * column. Clerk owns every auth step; Lane supplies the same control materials
 * and compact spacing as its recovery forms and loading skeleton.
 */
export const clerkEmbeddedAppearance = {
  variables: {
    ...clerkNeutralVariables,
    spacing: "var(--space-4)",
    fontSize: { xs: "var(--text-xs)", sm: "var(--text-xs)", md: "var(--text-sm)", lg: "var(--text-base)", xl: "var(--text-base)" },
    fontWeight: { normal: "var(--weight-normal)", medium: "var(--weight-medium)", semibold: "var(--weight-medium)", bold: "var(--weight-medium)" },
  },
  // Flush drops Clerk's card frame, padding and footer band (Tailwind classes lose to Clerk's
  // unlayered styles, so main's class strings could not); no logo, since the header carries Lane's mark.
  options: { elevation: "flush" as const, logoPlacement: "none" as const },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", maxWidth: "100%" },
    card: { width: "100%", gap: "var(--space-6)" },
    header: { textAlign: "start", alignItems: "flex-start", gap: "var(--space-2)" },
    main: { gap: "var(--space-5)" },
    form: { gap: "var(--space-5)" },
    formFieldRow: { gap: "var(--space-4)" },
    headerTitle: { fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", lineHeight: "var(--leading-display)", letterSpacing: "var(--tracking-display)", fontWeight: "var(--weight-semibold)" },
    headerSubtitle: { marginTop: 0, color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: "var(--leading-body)" },
    // Arc's Input answers focus with its border colour alone; Clerk's 4px halo would also show on pointer focus.
    formFieldInput: {
      minHeight: "var(--control-height-md)", paddingBlock: 0, paddingInlineStart: "var(--space-3)", fontSize: "var(--text-base)", borderRadius: "var(--radius-control)",
      "&[data-variant=default]": {
        boxShadow: "none", border: "var(--border-width) solid var(--input-border)", backgroundColor: "var(--input-background)", color: "var(--foreground)",
        "&:hover": { boxShadow: "none" },
        ...inputFocus,
        "&[data-feedback]": { boxShadow: "none", "&:hover": { boxShadow: "none" }, ...inputFocus },
        "&[data-feedback=error]": { borderColor: "var(--danger)", "&:focus-within": { borderColor: "var(--danger)" } },
        "&[data-feedback=warning]": { borderColor: "var(--warning)", "&:focus-within": { borderColor: "var(--warning)" } },
        "&[data-feedback=success]": { borderColor: "var(--success)", "&:focus-within": { borderColor: "var(--success)" } },
      },
      "@media (pointer: coarse)": { minHeight: "var(--size-inner-xlarge)" },
    },
    formButtonPrimary: {
      ...authControl,
      "&[data-variant=solid][data-color=primary]": { border: "var(--border-width) solid var(--primary)", boxShadow: "var(--button-default-shadow)", ...controlFocus },
      "&[data-variant=solid]::after": { background: "none" },
      "@media (hover: hover) and (pointer: fine)": { "&:hover": { backgroundColor: "var(--primary-hover-background)" } },
    },
    socialButtonsBlockButton: {
      ...authControl, color: "var(--foreground)", backgroundColor: "var(--button-secondary-background)",
      "&[data-variant=outline]": { border: "var(--border-width) solid var(--border-strong)", boxShadow: "var(--button-default-shadow)", ...controlFocus },
      "@media (hover: hover) and (pointer: fine)": { "&:hover": { backgroundColor: "var(--button-secondary-hover)" } },
    },
    socialButtonsBlockButtonText: { color: "var(--foreground)", fontWeight: "var(--weight-medium)" },
    footer: { gap: "var(--space-4)" },
    footerActionLink: authLink,
    formResendCodeLink: authLink,
    identityPreviewEditButton: authLink,
    formFieldAction: authLink,
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

const fullIdentifier = { whiteSpace: "normal", overflowWrap: "anywhere", textOverflow: "clip" } as const;

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
    // #257 D4: Clerk's window is a grid with a column for its navigation. Hiding the navigation alone left that
    // column in place and squeezed the page into it, so the grid keeps one full-width column.
    cardBox: { ...clerkAccountAppearance.elements.cardBox, gridTemplateColumns: "minmax(0, 1fr)" },
    navbar: { display: "none" },
    navbarMobileMenuRow: { display: "none" },
    tableHeaderCell: { fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", color: "var(--text-secondary)" },
    tableBodyCell: { fontSize: "var(--text-sm)" },
    // #257 D4: Clerk caps the member preview's width and cuts long emails off; names and emails show in full.
    userPreview: { maxWidth: "100%" },
    userPreviewMainIdentifierText: { fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", ...fullIdentifier },
    userPreviewSecondaryIdentifier: { fontSize: "var(--text-xs)", ...fullIdentifier },
    membersPageInviteButton: organizationControl,
    formButtonPrimary: organizationControl,
    formButtonReset: { ...organizationControl, color: "var(--foreground)", "&:hover": { color: "var(--foreground)" } },
    profileSectionPrimaryButton: { ...organizationControl, color: "var(--foreground)", "&:hover": { color: "var(--foreground)" } },
    organizationProfileMembersSearchInput: { minHeight: "var(--control-height-md)", fontSize: "var(--text-sm)" },
    selectButton: { minHeight: "var(--control-height-sm)", fontSize: "var(--text-sm)" },
  },
};
