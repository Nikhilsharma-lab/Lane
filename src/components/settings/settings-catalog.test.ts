import { describe, expect, it } from "vitest";
import { settingsEntries, settingsHref, settingsNavigation, searchSettings, showsSettingsInPlace } from "./settings-catalog";
describe("Settings search availability", () => {
  it("does not reveal member or administrative destinations to a guest", () => {
    for (const query of ["invite", "billing", "api", "workspace security"]) expect(searchSettings(settingsEntries("guest"), query)).toEqual([]);
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
});
