/**
 * #209 seam 1: writing and editing the Quarter note. Only Admins write or edit it, at any time during or after its
 * quarter; the note keeps its last editor and edit time. Real database, mocked Clerk session.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SESSION_ENDED, VIEWER_REFUSAL } from "@/lib/auth-guard";
import { requireTestDatabase } from "@/test/test-database";

const ORG = "org_quarter_note_actions";
const OTHER = "org_quarter_note_actions_other";
const ADMIN = "quarter_note_admin";
const SECOND_ADMIN = "quarter_note_admin_two";
const MEMBER = "quarter_note_member";
const session = vi.hoisted(() => ({ userId: "quarter_note_admin" as string | null, orgId: "org_quarter_note_actions", orgRole: "org:admin" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ ...session }) }));

const url = new URL(process.env.DATABASE_URL!);
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Acme','quarter-note-actions'), (${OTHER},'Other','quarter-note-actions-other')`;
  await connection`insert into profiles(id,full_name,email) values (${ADMIN},'Ada Admin','ada@quarter-note.test'), (${SECOND_ADMIN},'Bo Admin','bo@quarter-note.test'), (${MEMBER},'Max Member','max@quarter-note.test')`;
});
afterEach(async () => {
  vi.useRealTimers();
  Object.assign(session, { userId: ADMIN, orgId: ORG, orgRole: "org:admin" });
  await connection`delete from quarter_notes where org_id in (${ORG}, ${OTHER})`;
});
afterAll(async () => {
  await connection`delete from organizations where id in (${ORG}, ${OTHER})`;
  await connection`delete from profiles where id in (${ADMIN}, ${SECOND_ADMIN}, ${MEMBER})`;
  await connection.end();
});

const at = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(iso)); };
const actions = () => import("./quarter-note-actions");
const as = (userId: string | null, orgRole: string) => Object.assign(session, { userId, orgRole });
const stored = () => connection`select year, quarter, body, edited_by, edited_at from quarter_notes where org_id = ${ORG} order by year, quarter`;

describe("Quarter note", () => {
  it("an Admin writes a quarter's note, with themselves as the last editor and now as the edit time", async () => {
    at("2026-08-15T10:00:00.000Z");
    const { saveQuarterNote } = await actions();
    const saved = await saveQuarterNote({ year: 2026, quarter: 3, text: "  We rebuilt checkout.\nNotes: https://example.test/q3  ", expectedEditedAt: null }, { orgId: ORG });
    expect(saved).toEqual({ success: true, note: { text: "We rebuilt checkout.\nNotes: https://example.test/q3", editorName: "Ada Admin", editedAt: "2026-08-15T10:00:00.000Z" } });
    expect(await stored()).toEqual([{ year: 2026, quarter: 3, body: "We rebuilt checkout.\nNotes: https://example.test/q3", edited_by: ADMIN, edited_at: new Date("2026-08-15T10:00:00.000Z") }]);
  });

  it("is edited at any time after its quarter by any Admin, moving the last editor and edit time", async () => {
    at("2026-08-15T10:00:00.000Z");
    const { saveQuarterNote } = await actions();
    await saveQuarterNote({ year: 2026, quarter: 3, text: "First", expectedEditedAt: null }, { orgId: ORG });
    at("2027-02-01T09:00:00.000Z");
    as(SECOND_ADMIN, "org:admin");
    expect(await saveQuarterNote({ year: 2026, quarter: 3, text: "Second", expectedEditedAt: "2026-08-15T10:00:00.000Z" }, { orgId: ORG }))
      .toEqual({ success: true, note: { text: "Second", editorName: "Bo Admin", editedAt: "2027-02-01T09:00:00.000Z" } });
    expect(await stored()).toMatchObject([{ body: "Second", edited_by: SECOND_ADMIN }]);
  });

  it("refuses a quarter that hasn't begun", async () => {
    at("2026-09-30T23:59:59.000Z");
    const { saveQuarterNote } = await actions();
    expect(await saveQuarterNote({ year: 2026, quarter: 4, text: "Too early", expectedEditedAt: null }, { orgId: ORG })).toEqual({ error: "A Quarter note can be written once its quarter begins." });
    expect(await stored()).toEqual([]);
  });

  it("refuses an edit made over someone else's newer one, keeping their words", async () => {
    at("2026-08-15T10:00:00.000Z");
    const { saveQuarterNote } = await actions();
    await saveQuarterNote({ year: 2026, quarter: 3, text: "Ada's words", expectedEditedAt: null }, { orgId: ORG });
    as(SECOND_ADMIN, "org:admin");
    const stale = { error: "Someone else changed this Quarter note. Reload to see it before editing." };
    expect(await saveQuarterNote({ year: 2026, quarter: 3, text: "Bo's words", expectedEditedAt: null }, { orgId: ORG })).toEqual(stale);
    expect(await saveQuarterNote({ year: 2026, quarter: 3, text: "Bo's words", expectedEditedAt: "2026-08-01T00:00:00.000Z" }, { orgId: ORG })).toEqual(stale);
    expect(await stored()).toMatchObject([{ body: "Ada's words", edited_by: ADMIN }]);
  });

  it("clears the note when an Admin saves it empty", async () => {
    at("2026-08-15T10:00:00.000Z");
    const { saveQuarterNote } = await actions();
    await saveQuarterNote({ year: 2026, quarter: 3, text: "Draft", expectedEditedAt: null }, { orgId: ORG });
    expect(await saveQuarterNote({ year: 2026, quarter: 3, text: "   ", expectedEditedAt: "2026-08-15T10:00:00.000Z" }, { orgId: ORG })).toEqual({ success: true, note: null });
    expect(await stored()).toEqual([]);
  });

  it("refuses too long a note and a quarter that doesn't exist", async () => {
    at("2026-08-15T10:00:00.000Z");
    const { saveQuarterNote } = await actions();
    for (const bad of [{ year: 2026, quarter: 3, text: "x".repeat(4001), expectedEditedAt: null }, { year: 2026, quarter: 5, text: "Note", expectedEditedAt: null }, { year: 2026, quarter: 3, text: "Note" }])
      expect(await saveQuarterNote(bad as never, { orgId: ORG })).toHaveProperty("error");
    expect(await stored()).toEqual([]);
  });

  it("refuses Members, Guests, Viewers, the signed-out and other workspaces on the server", async () => {
    at("2026-08-15T10:00:00.000Z");
    const { saveQuarterNote } = await actions();
    const note = { year: 2026, quarter: 3 as const, text: "Not an Admin", expectedEditedAt: null };
    const refused = { error: "Only Admins can write the Quarter note." };
    for (const role of ["org:member", "org:guest", "org:viewer"]) {
      as(MEMBER, role);
      // #210: a Viewer is told they are read-only, whatever the change.
      expect(await saveQuarterNote(note, { orgId: ORG })).toEqual(role === "org:viewer" ? { error: VIEWER_REFUSAL } : refused);
    }
    as(ADMIN, "org:admin");
    expect(await saveQuarterNote(note, { orgId: OTHER })).toEqual(refused);
    as(null, "org:admin");
    expect(await saveQuarterNote(note, { orgId: ORG })).toEqual({ error: SESSION_ENDED, sessionExpired: true });
    expect(await connection`select 1 from quarter_notes where org_id in (${ORG}, ${OTHER})`).toHaveLength(0);
  });
});
