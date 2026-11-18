import { describe, expect, it } from "vitest";
import { sectionNotForRole, settingsEntries, settingsHref, settingsNavigation, searchSettings, settingsSectionAt, showsSettingsInPlace } from "./settings-catalog";
describe("Settings search availability", () => {
  it("does not reveal member or administrative destinations to a guest", () => {
    for (const query of ["invite", "billing", "api", "workspace security"]) expect(searchSettings(settingsEntries("guest"), query)).toEqual([]);
  });
  it("gives a Viewer the Metrics library and workspace details, but no Members or Inbox delivery (#210)", () => {
    const nav = settingsNavigation("viewer").map(entry => entry.id);
    expect(nav).toEqual(expect.arrayContaining(["profile", "workspace", "metrics"]));
    expect(nav).not.toContain("members");
    expect(nav).not.toContain("inbox-delivery");
    expect(searchSettings(settingsEntries("viewer"), "invite")).toEqual([]);
  });
  it("resolves synonyms to the working theme control", () => {
    expect(searchSettings(settingsEntries("member"), "dark mode")[0].def.target).toBe("theme");
  });
  it("keeps future settings discoverable with their availability and destination", () => {
    const result = searchSettings(settingsEntries("admin"), "usage")[0];
    expect(result.def).toMatchObject({ soon: true, section: "coming-soon", target: "future-usage" });
  });
  it("distinguishes identically named Request and Project settings", () => {
    expect(searchSettings(settingsEntries("member"), "project labels").map(r => r.def.id)).toEqual(["project-labels"]);
  });
});

describe("Settings → Slack (#207)", () => {
  it("is an Admin-only Workspace section, found by search", () => {
    expect(settingsNavigation("admin").find(entry => entry.id === "slack")).toMatchObject({ group: "Workspace", label: "Slack" });
    for (const role of ["member", "guest"]) expect(settingsNavigation(role).map(entry => entry.id)).not.toContain("slack");
    expect(searchSettings(settingsEntries("admin"), "slack")[0].def.id).toBe("slack");
    expect(searchSettings(settingsEntries("member"), "slack").map(r => r.def.id)).not.toContain("slack");
  });
});

describe("Settings → Billing (#213)", () => {
  it("is an Admin-only Workspace section, found by search", () => {
    expect(settingsNavigation("admin").find(entry => entry.id === "billing")).toMatchObject({ group: "Workspace", label: "Billing" });
    for (const role of ["member", "guest", "viewer"]) expect(settingsNavigation(role).map(entry => entry.id)).not.toContain("billing");
    for (const query of ["billing", "free requests", "plan"]) expect(searchSettings(settingsEntries("admin"), query)[0].def.id).toBe("billing");
    expect(searchSettings(settingsEntries("member"), "free requests")).toEqual([]);
  });
});

describe("Settings → Metrics (#196)", () => {
  it("is a Workspace section for Members and Admins, and hidden from a guest", () => {
    for (const role of ["member", "admin"]) expect(settingsNavigation(role).find(entry => entry.id === "metrics")).toMatchObject({ group: "Workspace", label: "Metrics" });
    expect(settingsNavigation("guest").map(entry => entry.id)).not.toContain("metrics");
    expect(searchSettings(settingsEntries("guest"), "metrics")).toEqual([]);
  });
  it("is found by search", () => {
    expect(searchSettings(settingsEntries("member"), "metrics")[0].def.id).toBe("metrics");
    expect(searchSettings(settingsEntries("member"), "conversion rate")[0].def.id).toBe("metrics");
  });
  it("lives at its own address; other sections at Profile's", () => {
    expect(settingsHref("metrics")).toBe("/settings/metrics");
    expect(settingsHref("members")).toBe("/settings/profile?section=members");
  });
  it("opens in place only where its page is already shown", () => {
    expect(showsSettingsInPlace("/settings/metrics", "/settings/metrics")).toBe(true);
    expect(showsSettingsInPlace("/settings/metrics", "/settings/profile")).toBe(false);
    expect(showsSettingsInPlace("/settings/profile?section=members", "/settings/metrics")).toBe(true);
    expect(showsSettingsInPlace("/settings/profile?section=members", "/settings/members")).toBe(true);
    expect(showsSettingsInPlace("/settings/profile?section=members", "/")).toBe(false);
  });
  it("goes back to the list from one definition's page (#197)", () => {
    expect(showsSettingsInPlace("/settings/metrics", "/settings/metrics/3f0c2a4e-1111-4222-8333-944445555666")).toBe(false);
  });
  it("names the section a page shows, one definition's page included (#197)", () => {
    expect(settingsSectionAt("/settings/metrics")).toBe("metrics");
    expect(settingsSectionAt("/settings/metrics/3f0c2a4e-1111-4222-8333-944445555666")).toBe("metrics");
    expect(settingsSectionAt("/settings/metricsx")).toBeNull();
    expect(settingsSectionAt("/settings/profile")).toBeNull();
  });
});

describe("Settings catalog cleanup (#287)", () => {
  const soon = (role: string) => settingsEntries(role).filter(entry => entry.soon).map(entry => `${entry.group} → ${entry.label}`);

  it("has one Manage account entry, which the connected-account words find (D32)", () => {
    for (const role of ["admin", "member", "viewer", "guest"]) {
      const entries = settingsEntries(role);
      expect(entries.map(entry => entry.label)).not.toContain("Connected accounts");
      for (const query of ["google", "Google", "connected accounts", "login"]) {
        expect(searchSettings(entries, query)[0].def, `${role}: ${query}`).toMatchObject({ id: "manage-account", label: "Manage account", section: "profile", target: "manage-account" });
      }
    }
  });

  it("no longer plans Display names or Request labels; Project labels stay planned (D25)", () => {
    for (const role of ["admin", "member"]) {
      expect(soon(role)).not.toContain("Preferences → Display names");
      expect(soon(role)).not.toContain("Requests → Labels");
      expect(soon(role)).toContain("Projects → Labels");
      expect(soon(role)).toEqual(expect.arrayContaining(["Preferences → Send comments on", "Requests → Intake templates", "Projects → Templates"]));
    }
    expect(searchSettings(settingsEntries("member"), "display names")).toEqual([]);
    expect(searchSettings(settingsEntries("member"), "labels").map(result => result.def.id)).toEqual(["project-labels"]);
  });

  it("describes Members by what each person can do there (D29)", () => {
    const members = (role: string) => settingsNavigation(role).find(entry => entry.id === "members")?.description;
    expect(members("member")).toBe("People in this workspace and their roles.");
    expect(members("admin")).toBe("Manage workspace members and invitations.");
    expect(settingsEntries("member").find(entry => entry.id === "members")?.description).toBe("People in this workspace and their roles.");
  });
});

describe("A section someone's role can't open (#288, D30)", () => {
  it("says who it is for, from the catalog", () => {
    expect(sectionNotForRole("billing", "member")).toBe("Billing is for Admins of this workspace.");
    expect(sectionNotForRole("slack", "viewer")).toBe("Slack is for Admins of this workspace.");
    expect(sectionNotForRole("members", "viewer")).toBe("Members is for Admins and Members of this workspace.");
    expect(sectionNotForRole("inbox-delivery", "guest")).toBe("Inbox delivery is for Admins and Members of this workspace.");
    expect(sectionNotForRole("workspace", "guest")).toBe("Workspace details is for Admins, Members and Viewers of this workspace.");
  });
  it("says nothing when the section opens, doesn't exist, or is only planned", () => {
    expect(sectionNotForRole("billing", "admin")).toBeNull();
    expect(sectionNotForRole("members", "member")).toBeNull();
    expect(sectionNotForRole("nonsense", "member")).toBeNull();
    expect(sectionNotForRole("api", "member")).toBeNull();
    expect(sectionNotForRole("role", "member")).toBeNull();
    expect(sectionNotForRole(null, "member")).toBeNull();
  });
});
