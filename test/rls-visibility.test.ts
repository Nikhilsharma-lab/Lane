/**
 * RLS visibility tests — mirrors the three Postgres policies on `requests`.
 *
 * Seed: one workspace, two teams, three users (admin, member, guest),
 * four streams spread across the two teams.  Each test asserts that the
 * user sees exactly the rows their role should permit.
 */

import { describe, it, expect } from "vitest";
import {
  filterVisibleStreams,
  memberCanSeeStream,
  adminCanSeeStream,
  guestCanSeeStream,
  type StreamRow,
  type TeamMembershipRow,
  type WorkspaceMemberRow,
  type StreamGuestRow,
} from "@/lib/nav/visibility";

// ── Seed data ───────────────────────────────────────────────────────────────

const WS = "ws-1";

const ADMIN_ID = "user-admin";
const MEMBER_ID = "user-member";
const GUEST_ID = "user-guest";

const TEAM_A = "team-a";
const TEAM_B = "team-b";

const streams: StreamRow[] = [
  { id: "stream-1", teamId: TEAM_A, workspaceId: WS },
  { id: "stream-2", teamId: TEAM_A, workspaceId: WS },
  { id: "stream-3", teamId: TEAM_B, workspaceId: WS },
  { id: "stream-4", teamId: TEAM_B, workspaceId: WS },
];

const teamMemberships: TeamMembershipRow[] = [
  // Member belongs to Team A only
  { teamId: TEAM_A, userId: MEMBER_ID },
];

const workspaceMembers: WorkspaceMemberRow[] = [
  { workspaceId: WS, userId: ADMIN_ID, role: "admin" },
  { workspaceId: WS, userId: MEMBER_ID, role: "member" },
  { workspaceId: WS, userId: GUEST_ID, role: "guest" },
];

const streamGuests: StreamGuestRow[] = [
  // Guest is invited to stream-3 only
  { streamId: "stream-3", userId: GUEST_ID },
];

const ctx = { teamMemberships, workspaceMembers, streamGuests };

// ── Tests ───────────────────────────────────────────────────────────────────

describe("RLS policy: members_see_team_streams", () => {
  it("member sees streams in their team", () => {
    expect(memberCanSeeStream(MEMBER_ID, streams[0], teamMemberships)).toBe(true);
    expect(memberCanSeeStream(MEMBER_ID, streams[1], teamMemberships)).toBe(true);
  });

  it("member does NOT see streams in other teams", () => {
    expect(memberCanSeeStream(MEMBER_ID, streams[2], teamMemberships)).toBe(false);
    expect(memberCanSeeStream(MEMBER_ID, streams[3], teamMemberships)).toBe(false);
  });

  it("guest with no team membership sees nothing via this policy", () => {
    expect(memberCanSeeStream(GUEST_ID, streams[0], teamMemberships)).toBe(false);
    expect(memberCanSeeStream(GUEST_ID, streams[2], teamMemberships)).toBe(false);
  });
});

describe("RLS policy: admins_see_all", () => {
  it("admin sees every stream in the workspace", () => {
    for (const stream of streams) {
      expect(adminCanSeeStream(ADMIN_ID, stream, workspaceMembers)).toBe(true);
    }
  });

  it("member does NOT get admin access", () => {
    for (const stream of streams) {
      expect(adminCanSeeStream(MEMBER_ID, stream, workspaceMembers)).toBe(false);
    }
  });

  it("guest does NOT get admin access", () => {
    for (const stream of streams) {
      expect(adminCanSeeStream(GUEST_ID, stream, workspaceMembers)).toBe(false);
    }
  });

  it("owner role also grants full access", () => {
    const withOwner: WorkspaceMemberRow[] = [
      ...workspaceMembers,
      { workspaceId: WS, userId: "user-owner", role: "owner" },
    ];
    for (const stream of streams) {
      expect(adminCanSeeStream("user-owner", stream, withOwner)).toBe(true);
    }
  });
});

describe("RLS policy: guests_see_invited_streams", () => {
  it("guest sees only the stream they are invited to", () => {
    expect(guestCanSeeStream(GUEST_ID, streams[2], streamGuests)).toBe(true);
  });

  it("guest does NOT see uninvited streams", () => {
    expect(guestCanSeeStream(GUEST_ID, streams[0], streamGuests)).toBe(false);
    expect(guestCanSeeStream(GUEST_ID, streams[1], streamGuests)).toBe(false);
    expect(guestCanSeeStream(GUEST_ID, streams[3], streamGuests)).toBe(false);
  });

  it("member is not affected by guest invites they do not have", () => {
    expect(guestCanSeeStream(MEMBER_ID, streams[2], streamGuests)).toBe(false);
  });
});

describe("Combined RLS — filterVisibleStreams", () => {
  it("admin sees all 4 streams", () => {
    const visible = filterVisibleStreams(ADMIN_ID, streams, ctx);
    expect(visible.map((s) => s.id)).toEqual([
      "stream-1",
      "stream-2",
      "stream-3",
      "stream-4",
    ]);
  });

  it("member sees only Team A streams (2)", () => {
    const visible = filterVisibleStreams(MEMBER_ID, streams, ctx);
    expect(visible.map((s) => s.id)).toEqual(["stream-1", "stream-2"]);
  });

  it("guest sees only the single invited stream", () => {
    const visible = filterVisibleStreams(GUEST_ID, streams, ctx);
    expect(visible.map((s) => s.id)).toEqual(["stream-3"]);
  });

  it("unknown user sees nothing", () => {
    const visible = filterVisibleStreams("user-nobody", streams, ctx);
    expect(visible).toEqual([]);
  });

  it("member with guest invite sees team streams PLUS invited stream", () => {
    const memberAlsoGuest: StreamGuestRow[] = [
      ...streamGuests,
      { streamId: "stream-4", userId: MEMBER_ID },
    ];
    const visible = filterVisibleStreams(MEMBER_ID, streams, {
      ...ctx,
      streamGuests: memberAlsoGuest,
    });
    // Team A (stream-1, stream-2) + guest invite (stream-4)
    expect(visible.map((s) => s.id)).toEqual([
      "stream-1",
      "stream-2",
      "stream-4",
    ]);
  });

  it("admin in a different workspace sees nothing", () => {
    const otherWsStreams: StreamRow[] = [
      { id: "other-1", teamId: "other-team", workspaceId: "ws-other" },
    ];
    const visible = filterVisibleStreams(ADMIN_ID, otherWsStreams, ctx);
    expect(visible).toEqual([]);
  });
});
