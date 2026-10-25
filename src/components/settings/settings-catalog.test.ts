import { describe, expect, it } from "vitest";
import { settingsEntries, settingsHref, settingsNavigation, searchSettings, settingsSectionAt, showsSettingsInPlace } from "./settings-catalog";
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
    const result = searchSettings(settingsEntries("admin"), "billing")[0];
    expect(result.def).toMatchObject({ soon: true, section: "coming-soon", target: "future-billing" });
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
