export function createParishCalendarUI(jsx, React) {
  const h = React.createElement;
  function Modal({ title, onClose, children }) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const dialog = ref.current;
      dialog.showModal();
      return () => dialog.close();
    }, []);
    const titleId = React.useId();
    return h('dialog', { ref, className: 'pc-dialog', 'aria-labelledby': titleId, onCancel: event => { event.preventDefault(); onClose(); }, onClick: event => {
      if (event.target === ref.current) {
        const rect = ref.current.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }
    } }, h('header', { className: 'pc-dialog__header' }, h('h4', { id: titleId }, title),
      h('button', { type: 'button', className: 'pc-icon', title: 'Close', 'aria-label': 'Close', onClick: onClose }, '\u00d7')),
    h('div', { className: 'pc-dialog__body' }, children));
  }
  function Calendar({ entries, visibleMonth, selectedDate, onChangeMonth, onSelectDate, onAdd, isLoading, message }) {
    const [openDate, setOpenDate] = React.useState(null);
    const year = visibleMonth.getFullYear(), month = visibleMonth.getMonth();
    const key = day => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const grouped = entries.reduce((all, entry) => {
      const date = String(entry.date || '').slice(0, 10);
      (all[date] ||= []).push(entry);
      return all;
    }, {});
    const days = new Date(year, month + 1, 0).getDate();
    const offset = new Date(year, month, 1).getDay();
    const dateLabel = date => new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return h('section', { className: 'pc-calendar screen-grid__full', 'aria-label': 'Parish Calendar' },
      h('header', { className: 'pc-toolbar' }, h('h4', null, visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
        h('div', { className: 'pc-toolbar__actions' },
          h('button', { type: 'button', className: 'pc-icon', title: 'Previous month', 'aria-label': 'Previous month', onClick: () => onChangeMonth(-1) }, '\u2039'),
          h('button', { type: 'button', className: 'pc-icon', title: 'Next month', 'aria-label': 'Next month', onClick: () => onChangeMonth(1) }, '\u203a'))),
      message ? h('p', { role: 'status' }, message.message) : null,
      isLoading ? h('p', { role: 'status' }, 'Loading schedules...') : null,
      h('div', { className: 'pc-weekdays', 'aria-hidden': true }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => h('span', { key: day }, day))),
      h('div', { className: 'pc-grid' },
        Array.from({ length: offset }, (_, i) => h('div', { key: `blank-${i}`, className: 'pc-day pc-day--blank' })),
        Array.from({ length: days }, (_, i) => {
          const date = key(i + 1), events = grouped[date] || [];
          return h('button', { key: date, type: 'button', className: `pc-day${date === selectedDate ? ' is-selected' : ''}`, 'aria-label': `${dateLabel(date)}, ${events.length} events`, onClick: () => { onSelectDate(date); setOpenDate(date); } },
            h('strong', null, i + 1), events.map(event => h('span', { key: event.id, className: `pc-event pc-event--${event.tone}`, title: event.title }, event.title)));
        }),
        Array.from({ length: (7 - (offset + days) % 7) % 7 }, (_, i) => h('div', { key: `end-${i}`, className: 'pc-day pc-day--blank' }))),
      openDate ? h(Modal, { title: dateLabel(openDate), onClose: () => setOpenDate(null) },
        h('div', { className: 'pc-event-list' }, (grouped[openDate] || []).length ? grouped[openDate].map(event => h('article', { key: event.id, className: 'pc-event-detail' }, h('small', null, event.badge), h('h4', null, event.title), h('p', null, event.meta), event.description ? h('p', null, event.description) : null)) : h('p', null, 'No events scheduled for this date.')),
        h('footer', { className: 'pc-dialog__footer' }, h('button', { type: 'button', className: 'primary-action', onClick: () => { setOpenDate(null); onAdd(); } }, '+ Add Mass Schedule'))) : null);
  }
  function useConfirmation() {
    const [pending, setPending] = React.useState(null);
    const resolver = React.useRef(null);
    React.useEffect(() => () => { resolver.current?.(false); }, []);
    function finish(result) {
      resolver.current?.(result);
      resolver.current = null;
      setPending(null);
    }
    function confirm(options) {
      resolver.current?.(false);
      return new Promise(resolve => { resolver.current = resolve; setPending(options); });
    }
    const dialog = pending ? h(Modal, { title: pending.title, onClose: () => finish(false) },
      h('p', { className: 'pc-confirm-message' }, pending.message),
      h('footer', { className: 'pc-dialog__footer pc-confirm-actions' },
        h('button', { type: 'button', className: 'secondary-action', autoFocus: true, onClick: () => finish(false) }, 'Cancel'),
        h('button', { type: 'button', className: pending.destructive ? 'pc-danger' : 'primary-action', onClick: () => finish(true) }, pending.action))) : null;
    return [confirm, dialog];
  }
  return { Calendar, Modal, useConfirmation };
}
