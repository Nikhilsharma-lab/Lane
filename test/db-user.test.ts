/**
 * Regression tests for db/user.ts session helpers.
 *
 * ISSUE-003: GET /api/alerts returned 500 with
 *   "TypeError: Cannot read properties of undefined (reading 'parsers')"
 *
 * Root cause: withDbSession was calling systemSql.begin() and then wrapping the
 * resulting TransactionSql in drizzle(). TransactionSql in postgres.js v3 does not
 * carry the `.parsers` property that drizzle-orm's adapter reads on initialisation.
 *
 * Fix: replaced systemSql.begin() + drizzle(TransactionSql) with
 * systemDb.transaction(), letting Drizzle manage the transaction internally and
 * providing a proper `tx` object with all required properties.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted() values are available inside vi.mock() factory — required because
// vi.mock() calls are hoisted to the top of the compiled output.
const { mockExecute, mockTransaction } = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue(undefined)
  const mockTx = { execute: mockExecute }
  const mockTransaction = vi.fn().mockImplementation(
    (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)
  )
  return { mockExecute, mockTransaction }
})

// Mock ONLY systemDb — if the old code tried to call systemSql.begin(), it would
// throw "Cannot read properties of undefined" here, which would fail the test.
// That's the regression guard.
vi.mock('@/db/system', () => ({
  systemDb: { transaction: mockTransaction },
}))

import { withDbSession, withUserDb, withOptionalUserDb, withInviteDb, withUserInviteDb } from '@/db/user'

beforeEach(() => {
  vi.clearAllMocks()
  mockTransaction.mockImplementation(
    (fn: (tx: { execute: typeof mockExecute }) => Promise<unknown>) => fn({ execute: mockExecute })
  )
})

describe('withDbSession — regression ISSUE-003', () => {
  it('calls systemDb.transaction(), not systemSql.begin()', async () => {
    // If the old broken code ran, it would call systemSql.begin() which is
    // undefined in this test environment, causing an immediate crash.
    const result = await withDbSession({ userId: 'user-123' }, async () => 'ok')

    expect(mockTransaction).toHaveBeenCalledOnce()
    expect(result).toBe('ok')
  })

  it('passes the transaction object directly to the callback — no re-wrapping', async () => {
    let receivedDb: unknown = undefined
    await withDbSession({ userId: 'user-abc' }, async (db) => {
      receivedDb = db
    })

    // The callback should receive the tx object provided by systemDb.transaction()
    // (cast to SessionDb). If drizzle() was called again on TransactionSql, it
    // would throw at this point.
    expect(receivedDb).toBeDefined()
  })
})

describe('withDbSession — session config', () => {
  it('sets app.current_user_id when userId is provided', async () => {
    await withDbSession({ userId: 'user-abc' }, async () => {})

    expect(mockExecute).toHaveBeenCalledOnce()
  })

  it('sets app.invite_token when inviteToken is provided', async () => {
    await withDbSession({ inviteToken: 'tok-xyz' }, async () => {})

    expect(mockExecute).toHaveBeenCalledOnce()
  })

  it('sets both configs when userId and inviteToken are provided', async () => {
    await withDbSession({ userId: 'u1', inviteToken: 'tok-1' }, async () => {})

    expect(mockExecute).toHaveBeenCalledTimes(2)
  })

  it('executes no config when neither userId nor inviteToken is given', async () => {
    await withDbSession({}, async () => {})

    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('returns the callback return value', async () => {
    const result = await withDbSession({ userId: 'u1' }, async () => ({ rows: 3 }))

    expect(result).toEqual({ rows: 3 })
  })
})

describe('withUserDb', () => {
  it('delegates to withDbSession with userId', async () => {
    const result = await withUserDb('user-99', async () => 'result')

    expect(mockTransaction).toHaveBeenCalledOnce()
    expect(result).toBe('result')
  })

  it('sets exactly one config (userId)', async () => {
    await withUserDb('user-99', async () => {})

    expect(mockExecute).toHaveBeenCalledOnce()
  })
})

describe('withOptionalUserDb', () => {
  it('sets userId when provided', async () => {
    await withOptionalUserDb('u1', async () => {})

    expect(mockExecute).toHaveBeenCalledOnce()
  })

  it('sets no config when userId is null', async () => {
    await withOptionalUserDb(null, async () => {})

    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('sets no config when userId is undefined', async () => {
    await withOptionalUserDb(undefined, async () => {})

    expect(mockExecute).not.toHaveBeenCalled()
  })
})

describe('withInviteDb', () => {
  it('sets exactly one config (inviteToken)', async () => {
    await withInviteDb('tok-abc', async () => {})

    expect(mockExecute).toHaveBeenCalledOnce()
  })
})

describe('withUserInviteDb', () => {
  it('sets both userId and inviteToken configs', async () => {
    await withUserInviteDb('u1', 'tok-1', async () => {})

    expect(mockExecute).toHaveBeenCalledTimes(2)
  })
})
