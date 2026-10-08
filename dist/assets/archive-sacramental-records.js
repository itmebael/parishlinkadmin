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
  const { useEffect, useState, useRef } = React;
  const { jsx, jsxs } = ui;
  const isBaptism = recordType === 'Baptism';
  const isConfirmation = recordType === 'Confirmation';
  const isMarriage = recordType === 'Marriage';
  const table = isBaptism ? 'baptism_records' : isConfirmation ? 'confirmation_records' : 'marriage_records';
  const fields = isBaptism ? baptismFields : isConfirmation ? confirmationFields : marriageFields;
  const dateFields = isBaptism
    ? ['year_baptism', 'month_batism', 'date_batism']
    : isConfirmation ? ['year_confirm', 'month_confirm', 'date_baptism'] : null;
  const [savedRecord, setSavedRecord] = useState(null);
  const dialogRef = useRef(null);
  const [values, setValues] = useState(() => emptyValues(fields));
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setValues(emptyValues(fields)); setEditingId(null); setNotice(''); setError(''); setSavedRecord(null);
  }, [table, session?.parish_id, session?.parishId, session?.email, session?.accessToken, session?.role]);
  useEffect(() => {
    if (savedRecord && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [savedRecord]);

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
      if (session?.role !== 'parish' || !session?.accessToken) throw new Error('Sign in as a parish administrator before saving records.');
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
      if (!saved) throw new Error('The record could not be saved. Please try again.');
      resetForm();
      setNotice(editingId ? 'Record updated.' : 'Record saved.');
      setSavedRecord(saved);
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
      savedRecord ? jsxs('dialog', { ref:dialogRef, className:'archive-saved-dialog', 'aria-labelledby':'archive-saved-title', onCancel:() => setSavedRecord(null), onClick:event => {if (event.target === event.currentTarget) {const rect=event.currentTarget.getBoundingClientRect(); if(event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setSavedRecord(null);}}, children:[
        jsxs('header', {className:'archive-saved-dialog__header', children:[
          jsxs('div', {children:[jsx('span', {children:'Record saved successfully'}), jsx('h3', {id:'archive-saved-title', children: savedRecord[isMarriage ? 'name_family_name' : 'name'] || recordType + ' record'})]}),
          jsx('button', {type:'button', className:'secondary-action', 'aria-label':'Close saved record', onClick:() => setSavedRecord(null), children:'Close'})
        ]}),
        jsx('dl', {className:'archive-saved-dialog__details', children:fields.map(([column,label]) => jsxs('div', {children:[jsx('dt', {children:label}), jsx('dd', {children:savedRecord[column] == null || savedRecord[column] === '' ? 'Not recorded' : String(savedRecord[column])})]}, column))}),
        jsxs('footer', {className:'archive-saved-dialog__footer', children:[jsx('button', {type:'button', className:'secondary-action', onClick:() => {edit(savedRecord); setSavedRecord(null);}, children:'Edit saved record'}), jsx('button', {type:'button', className:'primary-action', onClick:() => setSavedRecord(null), children:'Done'})]})
      ]}) : null,
    ]}),
  ]});
}
