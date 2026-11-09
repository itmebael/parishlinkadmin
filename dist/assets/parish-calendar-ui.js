import { ADDRESS_OPTIONS } from './mass-audience.js';
export function createParishCalendarUI(jsx, React) {
  const h = React.createElement;
  function Modal({ title, onClose, children, className = "", hideClose = false, headerAction = null }) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const dialog = ref.current;
      dialog.showModal();
      return () => dialog.close();
    }, []);
    const titleId = React.useId();
    return h('dialog', { ref, className: ['pc-dialog', className].filter(Boolean).join(' '), 'aria-labelledby': titleId, onCancel: event => { event.preventDefault(); onClose(); }, onClick: event => {
      if (event.target === ref.current) {
        const rect = ref.current.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }
    } }, h('header', { className: 'pc-dialog__header' }, h('h4', { id: titleId }, title), headerAction,
      hideClose ? null : h('button', { type: 'button', className: 'pc-icon', title: 'Close', 'aria-label': 'Close', onClick: onClose }, '\u00d7')),
    h('div', { className: 'pc-dialog__body' }, children));
  }
  function LocationField({ name, value, defaultValue = 'Main Parish', onChange }) {
    const [localValue, setLocalValue] = React.useState(defaultValue);
    const [customLocation, setCustomLocation] = React.useState(() => { const initial = String(value ?? defaultValue ?? '').trim(); return Boolean(initial && initial.toLowerCase() !== 'main parish' && !/^BEC Area:/i.test(initial)); });
    const location = String(value ?? localValue ?? '').trim();
    const isArea = /^BEC Area:/i.test(location);
    const type = isArea ? 'bec' : customLocation || (location && location.toLowerCase() !== 'main parish') ? 'other' : 'parish';
    const detail = isArea ? location.replace(/^BEC Area:\s*/i, '') : type === 'other' ? location : '';
    const update = next => { setLocalValue(next); onChange?.(next); };
    return h('div', { className: 'pc-location-field' },
      h('select', { 'aria-label': 'Mass location', value: type, onChange: event => { setCustomLocation(event.target.value === 'other'); update(event.target.value === 'parish' ? 'Main Parish' : event.target.value === 'bec' ? 'BEC Area: ' : ''); } },
        h('option', { value: 'parish' }, 'Main Parish'),
        h('option', { value: 'bec' }, 'BEC Area'),
        h('option', { value: 'other' }, 'Other location')),
      type === 'bec' ? h('select', { 'aria-label': 'BEC area', required: true, value: detail, onChange: event => update('BEC Area: ' + event.target.value) },
        h('option', { value: '', disabled: true }, 'Select a BEC area'),
        detail && !ADDRESS_OPTIONS.includes(detail) ? h('option', { value: detail, disabled: true }, detail + ' (choose an area below)') : null,
        ADDRESS_OPTIONS.map(area => h('option', { key: area, value: area }, area))) : type === 'other' ? h('input', { type: 'text', 'aria-label': 'Other location', placeholder: 'Enter the location', required: true, value: detail, onChange: event => update(event.target.value) }) : null,
      h('small', { className: 'pc-location-audience' }, type === 'bec' ? 'Visible only to parish members registered in the selected BEC area.' : type === 'parish' ? 'Visible to all members of your parish.' : 'Other locations are not listed on the member Mass Schedules page.'),
      name ? h('input', { type: 'hidden', name, value: location || 'Main Parish' }) : null);
  }
  function Calendar({ entries, visibleMonth, selectedDate, onChangeMonth, onSelectDate, onAdd, isLoading, message }) {
    const [openDate, setOpenDate] = React.useState(null);
    const year = visibleMonth.getFullYear(), month = visibleMonth.getMonth();
    const key = day => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const grouped = sortSchedules(entries).reduce((all, entry) => {
      const date = String(entry.date || '').slice(0, 10);
      (all[date] ||= []).push(entry);
      return all;
    }, {});
    const days = new Date(year, month + 1, 0).getDate();
    const offset = new Date(year, month, 1).getDay();
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dateLabel = date => new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return h('section', { className: 'pc-calendar screen-grid__full', 'aria-label': 'Parish Calendar' },
      h('header', { className: 'pc-toolbar' },
        h('button', { type: 'button', className: 'pc-month-nav', 'aria-label': 'Previous month', onClick: () => onChangeMonth(-1) }, '\u2039 Previous'),
        h('h4', { 'aria-live': 'polite', 'aria-atomic': true }, visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
        h('button', { type: 'button', className: 'pc-month-nav', 'aria-label': 'Next month', onClick: () => onChangeMonth(1) }, 'Next \u203a')),
      message ? h('p', { role: 'status' }, message.message) : null,
      isLoading ? h('p', { role: 'status' }, 'Loading schedules...') : null,
      h('div', { className: 'pc-weekdays', 'aria-hidden': true }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => h('span', { key: day }, day))),
      h('div', { className: 'pc-grid' },
        Array.from({ length: offset }, (_, i) => h('div', { key: `blank-${i}`, className: 'pc-day pc-day--blank' })),
        Array.from({ length: days }, (_, i) => {
          const date = key(i + 1), events = grouped[date] || [];
          return h('button', { key: date, type: 'button', className: `pc-day${date === selectedDate ? ' is-selected' : ''}${date === today ? ' is-today' : ''}`, 'aria-current': date === today ? 'date' : undefined, 'aria-pressed': date === selectedDate, 'aria-label': `${dateLabel(date)}, ${events.length} events`, onClick: () => { onSelectDate(date); setOpenDate(date); } },
            h('strong', null, i + 1), events.slice(0, 2).map(event => h('span', { key: event.id, className: `pc-event pc-event--${event.tone}`, title: event.title }, event.title)),
            events.length > 2 ? h('span', { className: 'pc-more' }, `+${events.length - 2} more`) : null);
        }),
        Array.from({ length: (7 - (offset + days) % 7) % 7 }, (_, i) => h('div', { key: `end-${i}`, className: 'pc-day pc-day--blank' }))),
      openDate ? h(Modal, { title: dateLabel(openDate), className: 'pc-dialog--day-details', onClose: () => setOpenDate(null), headerAction: h('button', { type: 'button', className: 'primary-action pc-day-add', onClick: () => { setOpenDate(null); onAdd(); } }, '+ Add Mass Schedule') },
        h('div', { className: 'pc-event-list' }, (grouped[openDate] || []).length ? grouped[openDate].map(event => h('article', { key: event.id, className: 'pc-event-detail' }, h('small', null, event.badge), h('h4', null, event.title), h('p', null, event.meta), event.description ? h('p', null, event.description) : null)) : h('p', null, 'No events scheduled for this date.'))) : null);
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
    const dialog = pending ? h(Modal, { title: pending.title, className: pending.compact ? 'pc-dialog--compact' : '', hideClose: pending.hideClose, onClose: () => finish(false) },
      pending.message ? h('p', { className: 'pc-confirm-message' }, pending.message) : null,
      h('footer', { className: 'pc-dialog__footer pc-confirm-actions' },
        h('button', { type: 'button', className: 'secondary-action', autoFocus: true, onClick: () => finish(false) }, 'Cancel'),
        h('button', { type: 'button', className: pending.destructive ? 'pc-danger' : 'primary-action', onClick: () => finish(true) }, pending.action))) : null;
    return [confirm, dialog];
  }
  return { Calendar, Modal, LocationField, useConfirmation };
}

export function formatScheduleTime(value) {
  if (!value) return 'Time not set';
  const match = String(value).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return String(value);
  const hour = Number(match[1]);
  if (hour > 23 || Number(match[2]) > 59) return String(value);
  return `${hour % 12 || 12}${match[2] === '00' ? '' : ':' + match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}
export function sortSchedules(entries) {
  const minutes = entry => {
    const match = String(entry.startTime || entry.start_time || '').match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? Number(match[1]) * 60 + Number(match[2]) : Infinity;
  };
  return [...entries].sort((left, right) => minutes(left) - minutes(right));
}
