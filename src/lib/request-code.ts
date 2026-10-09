const MAX_REQUEST_NUMBER = 2_147_483_647;

function isRequestNumber(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_REQUEST_NUMBER;
}

/** A workspace-local reference; UUIDs remain the route and authorization identity. */
export function formatRequestCode(requestNumber: number): string {
  if (!isRequestNumber(requestNumber)) throw new RangeError("Invalid saved Request number");
  return `LAN-${requestNumber}`;
}

/** Only a complete code adds an exact identifier match to ordinary text search. */
export function parseRequestCode(query: string): number | null {
  const match = /^LAN-([1-9]\d*)$/i.exec(query.trim());
  if (!match) return null;
  const number = Number(match[1]);
  return isRequestNumber(number) ? number : null;
}
