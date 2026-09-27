const baptismFields = [
  ['name', 'Name', 'text', true],
  ['year_baptism', 'Baptism year', 'number'],
  ['month_batism', 'Baptism month', 'text'],
  ['date_batism', 'Baptism day', 'number'],
  ['year_birth', 'Birth year', 'number'],
  ['month_birth', 'Birth month', 'text'],
  ['day_birth', 'Birth day', 'number'],
  ['mother_name', 'Mother name', 'text'],
  ['father_name', 'Father name', 'text'],
  ['forefathers', 'Forefathers', 'textarea'],
  ['foremothers', 'Foremothers', 'textarea'],
  ['godparents', 'Godparents', 'textarea'],
  ['location', 'Location', 'text'],
  ['fee', 'Fee', 'number'],
  ['minister', 'Minister', 'text'],
];

const confirmationFields = [
  ['name', 'Name', 'text', true],
  ['year_confirm', 'Confirmation year', 'number'],
  ['month_confirm', 'Confirmation month', 'text'],
  ['date_baptism', 'Confirmation day', 'number'],
  ['age', 'Age', 'text'],
  ['location', 'Location', 'text'],
  ['location_baptism', 'Baptism location', 'text'],
  ['mother_name', 'Mother name', 'text'],
  ['father_name', 'Father name', 'text'],
  ['godparents', 'Godparents', 'text'],
  ['stipend', 'Stipend', 'text'],
  ['minister', 'Minister', 'text'],
];

const marriageFields = [
  ['entry_no', 'Entry number', 'number'],
  ['marriage_date', 'Marriage date', 'date'],
  ['party_role', 'Party role', 'text'],
  ['name_family_name', 'Name and family name', 'text', true],
  ['status', 'Status', 'text'],
  ['age', 'Age', 'number'],
  ['origin_of_birth', 'Origin of birth', 'text'],
  ['residence', 'Residence', 'text'],
  ['parents', 'Parents', 'textarea'],
  ['witness_1', 'Witness 1', 'text'],
  ['witness_2', 'Witness 2', 'text'],
  ['witness_residence', 'Witness residence', 'textarea'],
  ['minister', 'Minister', 'text'],
  ['remarks', 'Remarks', 'textarea'],
];

function emptyValues(fields) {
  return Object.fromEntries(fields.map(([column]) => [column, '']));
}

function groupMarriageRecords(rows) {
  const groups = new Map();
  for (const record of rows) {
    const key = record.entry_no == null || record.entry_no === '' ? `record-${record.id}` : `entry-${record.entry_no}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return Array.from(groups, ([key, records]) => ({
    key,
    records: records.sort((left, right) => {
      const roleOrder = role => /groom/i.test(role || '') ? 0 : /bride/i.test(role || '') ? 1 : 2;
      return roleOrder(left.party_role) - roleOrder(right.party_role);
    }),
  }));
}

function parishDate(record, fields) {
  const year = record[fields[0]];
  const month = record[fields[1]];
  const day = record[fields[2]];
  return [month, day, year].filter(value => value !== null && value !== undefined && String(value).trim()).join(' ') || 'Not recorded';
}

async function resolveParishId(request, session) {
  let parishId = session?.parish_id || session?.parishId;
  if (!parishId && session?.email) {
    const parishes = await request('/rest/v1/rpc/get_parish_id_by_email', {
      method: 'POST', body: { p_email: session.email }, accessToken: session.accessToken,
    });
    if (Array.isArray(parishes) && parishes.length === 1) parishId = parishes[0].id;
  }
  if (!parishId) throw new Error('Your account is not linked to a parish. Ask an administrator to assign your parish.');
  return parishId;
}

export function ArchiveSacramentalRecords({ session, React, ui, request, recordType, options, onRecordTypeChange }) {
  const { useEffect, useState } = React;
  const { jsx, jsxs } = ui;
  const isBaptism = recordType === 'Baptism';
  const isConfirmation = recordType === 'Confirmation';
  const isMarriage = recordType === 'Marriage';
  const table = isBaptism ? 'baptism_records' : isConfirmation ? 'confirmation_records' : 'marriage_records';
  const fields = isBaptism ? baptismFields : isConfirmation ? confirmationFields : marriageFields;
  const dateFields = isBaptism
    ? ['year_baptism', 'month_batism', 'date_batism']
    : isConfirmation ? ['year_confirm', 'month_confirm', 'date_baptism'] : null;
  const [rows, setRows] = useState([]);
  const [values, setValues] = useState(() => emptyValues(fields));
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadRecords() {
    setLoading(true);
    setError('');
    try {
      if (session?.role !== 'parish' || !session?.accessToken) throw new Error('Sign in as a parish administrator to manage sacramental records.');
      const resolvedParishId = await resolveParishId(request, session);
      const query = new URLSearchParams({ select: '*', parish_id: `eq.${resolvedParishId}`, order: 'created_at.desc.nullslast,id.desc' });
      const result = await request(`/rest/v1/${table}?${query}`, { accessToken: session.accessToken });
      if (!Array.isArray(result)) throw new Error('The records response was not a list. Please try again.');
      setRows(result);
    } catch (reason) {
      setRows([]);
      setError(reason?.message || 'Could not load sacramental records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setRows([]);
    setValues(emptyValues(fields));
    setEditingId(null);
    setNotice('');
    loadRecords();
  }, [table, session?.parish_id, session?.parishId, session?.email, session?.accessToken, session?.role]);

  function setField(column, value) {
    setValues(current => ({ ...current, [column]: value }));
  }

  function resetForm() {
    setValues(emptyValues(fields));
    setEditingId(null);
    setNotice('');
  }

  async function save(event) {
    event.preventDefault();
    const nameColumn = isMarriage ? 'name_family_name' : 'name';
    if (!String(values[nameColumn] || '').trim()) {
      setError('Enter the person’s name before saving.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const resolvedParishId = await resolveParishId(request, session);
      const payload = { parish_id: resolvedParishId };
      for (const [column, , type] of fields) {
        const value = String(values[column] ?? '').trim();
        payload[column] = value === '' ? null : type === 'number' ? Number(value) : value;
        if (type === 'number' && value !== '' && !Number.isFinite(payload[column])) throw new Error(`${column} must be a valid number.`);
      }
      const endpoint = editingId
        ? `/rest/v1/${table}?id=eq.${encodeURIComponent(editingId)}&parish_id=eq.${encodeURIComponent(resolvedParishId)}&select=*`
        : `/rest/v1/${table}?select=*`;
      const result = await request(endpoint, {
        method: editingId ? 'PATCH' : 'POST',
        accessToken: session.accessToken,
        headers: { Prefer: 'return=representation' },
        body: payload,
      });
      const saved = Array.isArray(result) ? result[0] : result;
      if (!saved) throw new Error('The record could not be saved. Refresh the list and try again.');
      resetForm();
      setNotice(editingId ? 'Record updated.' : 'Record saved.');
      await loadRecords();
    } catch (reason) {
      setError(reason?.message || 'Could not save the record.');
    } finally {
      setSaving(false);
    }
  }

  function edit(record) {
    setEditingId(record.id);
    setValues(Object.fromEntries(fields.map(([column]) => [column, record[column] == null ? '' : String(record[column])])));
    setError('');
    setNotice('');
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  const renderField = ([column, label, type, required]) => jsxs('label', {
    className: `login-field archive-record-form__field ${type === 'textarea' ? 'archive-record-form__field--wide' : ''}`,
    children: [jsx('span', { children: label }), type === 'textarea'
      ? jsx('textarea', { name: column, value: values[column] || '', required: Boolean(required), rows: 2, onChange: event => setField(column, event.target.value) })
      : jsx('input', { name: column, type, value: values[column] || '', required: Boolean(required), step: column === 'fee' ? '0.01' : undefined, onChange: event => setField(column, event.target.value) })],
  }, column);

  return jsxs('div', { className: 'screen-grid archive-sacramental-records', children: [
    jsxs('article', { className: 'glass-card page-card screen-grid__full', children: [
      jsxs('div', { className: 'glass-card__header', children: [
        jsxs('div', { children: [jsx('h4', { children: `${recordType} Records` }), jsx('p', { className: 'page-card__lead', children: `Manage parish ${recordType.toLowerCase()} records.` })] }),
        jsxs('label', { className: 'login-field baptism-records__type', children: [jsx('span', { children: 'Record Type' }), jsx('select', { value: recordType, onChange: event => { resetForm(); onRecordTypeChange(event.target.value); }, children: options.map(option => jsx('option', { value: option, children: option }, option)) })] }),
      ] }),
      error ? jsx('div', { className: 'auth-notice auth-notice--error', role: 'alert', children: error }) : null,
      notice ? jsx('div', { className: 'auth-notice auth-notice--success', role: 'status', children: notice }) : null,
      jsxs('form', { className: 'service-form archive-record-form archive-sacramental-form', onSubmit: save, children: [
        fields.map(renderField),
        jsx('div', { className: 'archive-sacramental-form__actions', children: [
          jsx('button', { type: 'submit', className: 'primary-action login-submit', disabled: saving, children: saving ? 'Saving…' : editingId ? 'Update Record' : 'Save Record' }),
          editingId ? jsx('button', { type: 'button', className: 'secondary-action', onClick: resetForm, disabled: saving, children: 'Cancel' }) : null,
        ] }),
      ] }),
      jsxs('div', { className: 'glass-card__header archive-sacramental-records__list-header', children: [
        jsxs('div', { children: [jsx('h4', { children: `${recordType} Records` }), jsx('p', { className: 'page-card__lead', children: 'Saved records for your parish.' })] }),
        jsx('span', { className: 'status-badge status-badge--blue', children: `${isMarriage ? groupMarriageRecords(rows).length : rows.length} records` }),
      ] }),
      loading ? jsx('p', { role: 'status', children: 'Loading records…' }) : rows.length ? jsx('div', { className: 'archive-record-list', children: (isMarriage ? groupMarriageRecords(rows) : rows.map(record => ({ key: record.id, records: [record] }))).map(group => {
        const record = group.records[0];
        if (isMarriage) return jsxs('section', { className: 'archive-record-row archive-record-row--marriage', children: [
          jsxs('div', { className: 'archive-record-row__identity', children: [jsx('span', { className: 'status-badge status-badge--blue', children: 'Marriage' }), jsxs('div', { children: [jsx('strong', { children: `Entry ${record.entry_no ?? '—'}` }), jsx('span', { children: record.marriage_date || 'Date not recorded' })] })] }),
          jsx('div', { className: 'archive-marriage-parties', children: group.records.map((party, index) => {
            const role = /groom/i.test(party.party_role || '') ? 'Groom' : /bride/i.test(party.party_role || '') ? 'Bride' : index === 0 ? 'Groom' : index === 1 ? 'Bride' : `Party ${index + 1}`;
            const partyCells = fields.filter(([column]) => !['entry_no', 'marriage_date', 'party_role', 'name_family_name'].includes(column));
            if (party.created_at) partyCells.push(['created_at', 'Recorded on', 'text']);
            return jsxs('article', { className: 'archive-marriage-party', children: [
              jsxs('header', { children: [jsxs('div', { children: [jsx('span', { children: role }), jsx('strong', { children: party.name_family_name || 'Name not recorded' })] }), jsx('button', { type: 'button', className: 'secondary-action archive-record-edit', onClick: () => edit(party), children: editingId === party.id ? 'Editing…' : 'Edit' })] }),
              jsx('div', { className: 'archive-record-row__cells', children: partyCells.map(([column, label]) => jsxs('div', { children: [jsx('span', { children: label }), jsx('strong', { children: party[column] == null || party[column] === '' ? 'Not recorded' : String(party[column]) })] }, column)) }),
            ] }, party.id);
          }) }),
        ] }, group.key);
        const nameColumn = isMarriage ? 'name_family_name' : 'name';
        const name = record[nameColumn] || 'Name not recorded';
        const date = isMarriage ? record.marriage_date || 'Not recorded' : parishDate(record, dateFields);
        const cells = fields.filter(([column]) => column !== nameColumn && column !== 'marriage_date');
        if (record.created_at) cells.push(['created_at', 'Recorded on', 'text']);
        return jsxs('section', { className: 'archive-record-row', children: [
          jsxs('div', { className: 'archive-record-row__identity', children: [jsx('span', { className: 'status-badge status-badge--blue', children: recordType }), jsxs('div', { children: [jsx('strong', { children: name }), jsx('span', { children: date })] })] }),
          jsx('div', { className: 'archive-record-row__cells', children: cells.map(([column, label]) => jsxs('div', { children: [jsx('span', { children: label }), jsx('strong', { children: record[column] == null || record[column] === '' ? 'Not recorded' : String(record[column]) })] }, column)) }),
          jsx('div', { className: 'archive-record-row__actions', children: jsx('button', { type: 'button', className: 'secondary-action archive-record-edit', onClick: () => edit(record), children: editingId === record.id ? 'Editing…' : 'Edit' }) }),
        ] }, record.id);
      }) }) : jsx('div', { className: 'empty-state', children: [jsx('strong', { children: `No ${recordType.toLowerCase()} records yet` }), jsx('span', { children: 'Saved records for this parish will appear here.' })] }),
    ] }),
  ] });
}
