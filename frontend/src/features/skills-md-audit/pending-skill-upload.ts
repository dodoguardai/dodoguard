/**
 * Holds a ZIP or Markdown selection while navigating from the skill catalog to the run page.
 * Avoids sessionStorage size limits for ZIPs (File reference only).
 */

export type PendingSkillUpload =
  | { kind: 'zip'; file: File }
  | { kind: 'md'; text: string; fileName?: string };

let pending: PendingSkillUpload | null = null;

export function setPendingSkillUpload(next: PendingSkillUpload | null) {
  pending = next;
}

export function takePendingSkillUpload(): PendingSkillUpload | null {
  const cur = pending;
  pending = null;
  return cur;
}
