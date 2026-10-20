import { describe, expect, it } from "vitest";
import { settingsEntries, searchSettings } from "./settings-catalog";
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
