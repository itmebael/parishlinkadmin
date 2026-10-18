// Resolve queue ownership from the signed-in administrator, never a default parish.
export async function resolveQueueParish(session, query) {
  if (session?.role !== 'parish' || !session?.accessToken) throw new Error('Please sign in again to load your parish queue.');
  const email = String(session.email || session.user?.email || '').trim();
  const id = session.parish_id || session.parishId || session.user?.app_metadata?.parish_id || session.user?.user_metadata?.parish_id;
  let parish;
  if (email) {
    const rows = await query('parishes', 'select=id,parish_name&email=eq.' + encodeURIComponent(email) + '&limit=2');
    if (rows.length === 1) parish = rows[0];
  }
  if (!parish && id) {
    const rows = await query('parishes', 'select=id,parish_name&id=eq.' + encodeURIComponent(id) + '&limit=1');
    parish = rows[0];
  }
  if (!parish?.id || !String(parish.parish_name || '').trim()) throw new Error('Your account is not linked to a parish. Please check your parish profile.');
  return parish;
}
export function queueParishFilter(parish) {
  const name = String(parish?.parish_name || '').trim();
  if (!name) throw new Error('A parish is required to load requests.');
  // Escape pattern characters so similarly named parishes cannot match.
  return 'parish_name=ilike.' + encodeURIComponent(name.replace(/[\\*%_]/g, '\\$&'));
}