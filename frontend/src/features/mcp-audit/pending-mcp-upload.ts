/**
 * In-memory handoff when navigating from MCP catalog upload dialog to run page (ZIP only).
 */

export type PendingMcpUpload = { kind: 'zip'; file: File };

let pending: PendingMcpUpload | null = null;

export function setPendingMcpUpload(next: PendingMcpUpload | null) {
  pending = next;
}

export function takePendingMcpUpload(): PendingMcpUpload | null {
  const cur = pending;
  pending = null;
  return cur;
}
