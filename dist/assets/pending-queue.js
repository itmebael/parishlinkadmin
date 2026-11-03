let selectedQueueRequest = null;
export function takePendingQueueRequest() {
  const row = selectedQueueRequest;
  selectedQueueRequest = null;
  return row;
}
const pendingStatuses = new Set(['pending', 'booked', 'appointment', 'submitted', 'correction']);
export function isCertificateRequest(row) {
  const reference = String(row.reference_number || '').toUpperCase();
  if (reference.startsWith('APT-') || String(row.booking_status).toLowerCase() === 'appointment') return false;
  return reference.startsWith('CERT-') || reference.startsWith('COR-') || /certificate|correction/i.test(String(row.service_name || ''));
}
export function pendingQueueRows(rows, tab) {
  return rows.filter(row => pendingStatuses.has(String(row.booking_status || 'Pending').trim().toLowerCase()))
    .filter(row => isCertificateRequest(row) === (tab === 'certificates'));
}
export function PendingQueue({ React, rows = [], loading, error, EmptyState, onNavigate }) {
  const h = React.createElement;
  const [tab, setTab] = React.useState('certificates');
  const tabs = [{ id: 'certificates', label: 'Certificates Queue' }, { id: 'bookings', label: 'Booking Queue' }];
  const items = pendingQueueRows(rows, tab);
  function onKeyDown(event) {
    const current = tabs.findIndex(item => item.id === tab);
    const next = event.key === 'ArrowRight' ? (current + 1) % tabs.length : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next].id);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
  }
  return h('article', { className: 'glass-card page-card pending-queue-card' },
    h('div', { className: 'glass-card__header' }, h('h4', { children: 'Pending Queue' })),
    h('div', { className: 'pending-queue-tabs', role: 'tablist', 'aria-label': 'Pending request queues' },
      ...tabs.map(item => h('button', {
        key: item.id, id: 'pending-queue-' + item.id + '-tab', type: 'button', role: 'tab',
        'aria-selected': tab === item.id, 'aria-controls': 'pending-queue-' + item.id + '-panel',
        tabIndex: tab === item.id ? 0 : -1, onClick: () => setTab(item.id), onKeyDown,
      }, item.label))),
    ...tabs.map(item => h('div', {
      key: item.id, className: 'queue-list pending-queue-panel', role: 'tabpanel',
      id: 'pending-queue-' + item.id + '-panel', 'aria-labelledby': 'pending-queue-' + item.id + '-tab',
      hidden: tab !== item.id, tabIndex: 0,
    }, tab !== item.id ? null : error ? h('p', { className: 'pending-queue-error', role: 'alert' }, 'Could not load pending requests. ' + error) : loading ? h(EmptyState, { title: 'Loading', message: 'Getting the latest requests…' }) : !items.length ? h(EmptyState, {
      title: tab === 'certificates' ? 'No pending certificate requests' : 'No pending bookings',
      message: tab === 'certificates' ? 'Certificate requests awaiting review will appear here.' : 'Bookings awaiting review will appear here.',
    }) : items.map(row => h('button', {
      key: row.id, type: 'button', className: 'queue-list__item',
      'aria-label': 'Open ' + (row.service_name || 'request') + ' for ' + (row.client_name || 'requester'),
      onClick: () => {
        selectedQueueRequest = row;
        onNavigate(isCertificateRequest(row) ? 'parish-services' : 'parish-bookings');
      },
    },
      h('div', { className: 'queue-list__avatar', 'aria-hidden': true }, String(row.client_name || '?').charAt(0).toUpperCase()),
      h('div', { className: 'pending-queue-details' },
        h('strong', { className: 'pending-queue-name' }, row.client_name || 'Name unavailable'),
        h('span', { className: 'pending-queue-service' }, row.service_name || 'Service')))))));
}
