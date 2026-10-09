/** Arc workspace-sidebar's six project tones, assigned by stable Project ID. */
export const PROJECT_TONES = ["blue", "green", "violet", "amber", "coral", "slate"] as const;

export type ProjectTone = (typeof PROJECT_TONES)[number];

export function projectToneForId(id: string): ProjectTone {
  let hash = 0;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return PROJECT_TONES[hash % PROJECT_TONES.length];
}
