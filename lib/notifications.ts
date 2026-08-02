/** Bildirim satırını UI formatına çevir */

export function formatNotificationRow(n: Record<string, unknown>) {
  const raw = n.created_at;
  let createdDisplay = '';
  try {
    createdDisplay = new Date(String(raw)).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    createdDisplay = String(raw ?? '');
  }

  return {
    ...n,
    created_at_raw: raw,
    created_at: createdDisplay,
  };
}

export function isNotificationOwnedBy(
  n: { user_id?: string | null },
  currentUserId?: string | null,
  fullName?: string | null
): boolean {
  if (currentUserId && n.user_id === currentUserId) return true;
  if (fullName && n.user_id === fullName) return true;
  return false;
}
