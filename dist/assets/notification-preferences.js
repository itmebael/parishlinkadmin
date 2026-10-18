// Account-scoped preferences for the admin notification menu.
export function notificationStorageKey(session) {
  const identity = session?.userId || session?.user?.id || session?.email || session?.user?.email || 'guest';
  return 'parishlink-admin-notifications:' + String(identity).trim().toLowerCase();
}
export function loadNotificationState(key, storage = globalThis.localStorage) {
  try { const value = JSON.parse(storage.getItem(key) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}
export function updateNotificationState(state, keys, action) {
  const next = { ...state };
  for (const id of Array.isArray(keys) ? keys : [keys]) if (id) next[id] = { ...next[id], [action === 'delete' ? 'deleted' : 'read']: true };
  return next;
}
export function visibleNotifications(items, state = {}) {
  return items.filter(item => !state[item._key]?.deleted).map(item => ({ ...item, read: Boolean(item.read || state[item._key]?.read) }));
}
export function useNotificationPreferences(React, session) {
  const key = notificationStorageKey(session);
  const [state, setState] = React.useState(() => loadNotificationState(key));
  React.useEffect(() => {
    const refresh = event => { if (!event || event.key === key || event.key === null) setState(loadNotificationState(key)); };
    refresh(); window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [key]);
  function change(keys, action) {
    setState(previous => {
      const next = updateNotificationState(previous, keys, action);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  return { state, change };
}
