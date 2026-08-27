/** Display helpers for the authenticated user in layout chrome. */

export function getUserDisplayName(name?: string | null, email?: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (email?.trim()) {
    return email.trim();
  }
  return 'Current user';
}

export function getUserInitials(name?: string | null, email?: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  if (email?.trim()) {
    return email.trim().slice(0, 2).toUpperCase();
  }
  return 'U';
}

export function getUserAvatarUrl(avatar?: string | null): string | undefined {
  const trimmed = avatar?.trim();
  return trimmed || undefined;
}
