/**
 * #261: the one name a person goes by in Lane, from their sign-in (Clerk) account: first and last name, else the
 * username, else the email, else "User". Lane saves a copy on the profile, which every page reads; Settings →
 * Profile asks the server to resync it when the account's name changes (`syncAccountName`). Pure and client-safe.
 */
export type AccountNameSource = {
  firstName?: string | null
  lastName?: string | null
  username?: string | null
  email?: string | null
}

export function accountName(account: AccountNameSource): string {
  const name = [account.firstName, account.lastName].map(part => part?.trim()).filter(Boolean).join(" ")
  return name || account.username?.trim() || account.email?.trim() || "User"
}
