// A DATABASE_URL pasted into a dashboard can pick up characters nobody sees:
// a line separator (U+2028), a zero-width space, a byte order mark or quotes.
// postgres.js reads the last path segment as the database name, so a stray
// U+2028 asked Postgres for "postgres%E2%80%A8" and took production down on
// 2026-10-26. A real URL never starts or ends with any of these.
const EDGE_JUNK = /^[\s​-‍⁠﻿"']+|[\s​-‍⁠﻿"']+$/g;

export function cleanDatabaseUrl(raw: string | undefined): string | undefined {
  const cleaned = raw?.replace(EDGE_JUNK, "");
  return cleaned ? cleaned : undefined;
}
