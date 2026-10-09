"use client";

import { OrganizationProfile } from "@clerk/nextjs";
import { clerkNeutralVariables } from "./clerk-appearance";

// Clerk's supported route ordering makes the first built-in page the root route.
// https://clerk.com/docs/nextjs/guides/customizing-clerk/adding-items/organization-profile
export function ClerkMembersProfile() {
  return (
    <OrganizationProfile
      routing="hash"
      afterLeaveOrganizationUrl="/onboarding"
      appearance={{
        variables: clerkNeutralVariables,
        elements: {
          rootBox: { width: "100%" },
          cardBox: { width: "100%", border: 0, boxShadow: "none", backgroundColor: "transparent" },
          card: { width: "100%", border: 0, boxShadow: "none", backgroundColor: "transparent" },
        },
      }}
    >
      <OrganizationProfile.Page label="members" />
      <OrganizationProfile.Page label="general" />
    </OrganizationProfile>
  );
}
