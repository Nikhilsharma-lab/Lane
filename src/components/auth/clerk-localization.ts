import type { LocalizationResource } from "@clerk/nextjs/types";

/**
 * #289: Lane's words on Clerk's screens, set once on ClerkProvider so sign-in, sign-up, the session tasks and
 * every Clerk popup share them. Only keys of the installed @clerk/localizations (the bundled @clerk/ui's
 * English) are overridden; everything else stays Clerk's copy.
 *
 * - Sign-in has no subtitle: the empty value draws an empty line, which `clerkEmbeddedAppearance` hides.
 * - Create workspace says what to do and that the name isn't final.
 * - Every string Clerk exposes with "organization" says "workspace" (vocabulary: "workspace" wherever Lane
 *   controls the word). `{{organizationName}}`-style tokens are Clerk's placeholders and stay as they are.
 *   clerk-localization.test.ts fails if the installed version adds an "organization" string not listed here.
 */
export const clerkLocalization = {
  signIn: {
    start: {
      title: "Sign in to Lane",
      subtitle: "",
    },
    ssoFallback: { notice: "Your workspace requires single sign-on. Continuing without it is recorded." },
  },
  signUp: {
    start: { title: "Create your Lane account" },
  },
  taskChooseOrganization: {
    alerts: {
      organizationAlreadyExists: "A workspace already exists for the detected company name ({{organizationName}}) and {{organizationDomain}}. Join by invitation.",
    },
    chooseOrganization: {
      title: "Choose a workspace",
      subtitle: "Join an existing workspace or create a new one",
      subtitle__createOrganizationDisabled: "Join an existing workspace",
      action__createOrganization: "Create new workspace",
    },
    createOrganization: {
      title: "Name your workspace",
      subtitle: "You can change it later in Settings.",
      formFieldInputPlaceholder__name: "My workspace",
      formFieldInputPlaceholder__slug: "my-workspace",
    },
    organizationCreationDisabled: {
      title: "You must belong to a workspace",
      subtitle: "Contact your workspace Admin for an invitation.",
    },
  },
  createOrganization: {
    title: "Create workspace",
    formButtonSubmit: "Create workspace",
  },
  formFieldInputPlaceholder__organizationName: "Workspace name",
  organizationList: {
    action__createOrganization: "Create workspace",
    createOrganization: "Create workspace",
    titleWithoutPersonal: "Choose a workspace",
  },
  organizationSwitcher: {
    action__closeOrganizationSwitcher: "Close workspace switcher",
    action__createOrganization: "Create workspace",
    action__openOrganizationSwitcher: "Open workspace switcher",
    notSelected: "No workspace selected",
  },
  organizationProfile: {
    navbar: { title: "Workspace", description: "Manage your workspace." },
    createDomainPage: {
      subtitle: "Add the domain to verify. Users with email addresses at this domain can join the workspace automatically or request to join.",
    },
    membersPage: {
      invitationsTab: {
        autoInvitations: {
          headerSubtitle: "Invite users by connecting an email domain with your workspace. Anyone who signs up with a matching email domain will be able to join the workspace anytime.",
        },
      },
      requestsTab: {
        autoSuggestions: {
          headerSubtitle: "Users who sign up with a matching email domain, will be able to see a suggestion to request to join your workspace.",
        },
      },
    },
    plansPage: {
      alerts: {
        noPermissionsToManageBilling: "You do not have permissions to manage billing for this workspace.",
        planMembershipLimitExceeded: "Your workspace has {{count}} members (including pending invitations). This plan only allows {{limit}} members.",
      },
    },
    profilePage: {
      successMessage: "The workspace has been updated.",
      domainSection: {
        subtitle: "Allow users to join the workspace automatically or request to join based on a verified email domain.",
      },
      dangerSection: {
        deleteOrganization: {
          title: "Delete workspace",
          actionDescription: "Type \"{{organizationName}}\" below to continue.",
          messageLine1: "Are you sure you want to delete this workspace?",
          successMessage: "You have deleted the workspace.",
        },
        leaveOrganization: {
          title: "Leave workspace",
          actionDescription: "Type \"{{organizationName}}\" below to continue.",
          messageLine1: "Are you sure you want to leave this workspace? You will lose access to this workspace and its applications.",
          successMessage: "You have left the workspace.",
        },
      },
    },
    removeDomainPage: { messageLine2: "Users won’t be able to join the workspace automatically after this." },
    securityPage: {
      directorySyncSection: {
        description: "Automatically add, update, and remove workspace members from your identity provider's directory. Requires an SSO connection.",
      },
      ssoSection: {
        tooltip: "Members without a matching domain can still sign in using existing auth methods. New members will be assigned to {{role}} in this workspace.",
      },
    },
    verifiedDomainPage: {
      enrollmentTab: {
        subtitle: "Choose how users from this domain can join the workspace.",
        automaticInvitationOption__description: "Users are automatically invited to join the workspace when they sign-up and can join anytime.",
        automaticSuggestionOption__description: "Users receive a suggestion to request to join, but must be approved by an Admin before they are able to join the workspace.",
        manualInvitationOption__description: "Users can only be invited manually to the workspace.",
      },
    },
  },
  configureSSO: {
    connectionScopeBanner: {
      subtitle__adding: "This workspace already has {{count}} SSO connections.",
      subtitle__editing: "This workspace has {{count}} SSO connections. Changes here apply only to this connection.",
    },
    missingManageEnterpriseConnectionsPermission: {
      subtitle: "Contact your workspace's administrator to upgrade your permissions.",
    },
    organizationDomainsStep: {
      subtitle: "Add and verify ownership of the domains your workspace uses to sign in.",
    },
  },
  unstable__errors: {
    already_a_member_in_organization: "{{email}} is already a member of the workspace.",
    insufficient_seats_change_plan: "Your workspace does not have enough seats to invite the desired number of members. Please change to a plan that supports the number of members you are attempting to invite.",
    insufficient_seats_contact_support: "Your workspace does not have enough seats to invite the desired number of members. Please contact support.",
    organization_membership_quota_exceeded: "You have reached your limit of workspace memberships, including outstanding invitations.",
    organization_not_found_or_unauthorized: "You are no longer a member of this workspace. Please choose or create another one.",
    organization_not_found_or_unauthorized_with_create_organization_disabled: "You are no longer a member of this workspace. Please choose another one.",
  },
} satisfies LocalizationResource;
