/**
 * Polish bar §13 (A110, A222): the one rule for a text field's counter. It stays quiet until the text nears the
 * limit (the last fifth of it, and never fewer than ten characters' warning), then counts down what is left.
 * It counts as the field's `maxLength` does, so the counter and the field always agree. Show it as the field's
 * description (Arc `input` rolls the number).
 */
export function charactersLeftNote(value: string, limit: number): string | undefined {
  const left = limit - value.length;
  if (left > Math.max(10, Math.ceil(limit / 5))) return undefined;
  return left <= 0 ? "No characters left" : left === 1 ? "1 character left" : `${left} characters left`;
}
