// Shared by the dashboard and Reports overview. Never query members unscoped.
export async function loadParishMembers(session, query) {
  session = session || {};
  const user = session.user || {};
  const metadata = user.app_metadata || {};
  const profile = user.user_metadata || {};
  const email = String(session.email || user.email || '').trim();
  const id = session.parish_id || session.parishId || metadata.parish_id || profile.parish_id;
  let parish;
  if (email) {
    const rows = await query('parishes', 'select=id,parish_name&email=eq.' + encodeURIComponent(email) + '&limit=2');
    if (rows.length === 1) parish = rows[0];
  }
  if (!parish && id) {
    const rows = await query('parishes', 'select=id,parish_name&id=eq.' + encodeURIComponent(id) + '&limit=1');
    parish = rows[0];
  }
  if (!parish) throw new Error('Could not find the parish linked to your account. Please check your parish profile.');

  async function readAll(scope) {
    const result = [];
    // Paginate instead of treating the PostgREST row limit as the total.
    for (let offset = 0; ; ) {
      const rows = await query('registered_users', 'select=id&' + scope + '&order=id.asc&limit=500&offset=' + offset);
      if (!rows.length) return result;
      result.push(...rows);
      offset += rows.length;
    }
  }
  const members = await readAll('parish_id=eq.' + encodeURIComponent(parish.id));
  if (parish.parish_name) {
    try {
      // Legacy registrations may store only a name. An explicit ID always wins.
      const name = String(parish.parish_name).trim().replace(/[\\*%_]/g, '\\$&');
      members.push(...await readAll('parish_id=is.null&parish_name=ilike.' + encodeURIComponent(name)));
    } catch (error) {
      // Older schemas have no compatibility name column; ID results still work.
      if (!/parish_name/i.test(String(error.message)) || !/does not exist|schema cache|could not find/i.test(String(error.message))) throw error;
    }
  }
  return [...new Map(members.map(row => [row.id, row])).values()];
}
