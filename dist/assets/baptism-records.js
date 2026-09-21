const PAGE_SIZE = 25;
const COLUMNS = 'id,year_baptism,month_batism,date_batism,name,year_birth,month_birth,day_birth,mother_name,father_name,forefathers,foremothers,godparents,location,fee,minister,created_at,parish_id';

export function recordDate(year, month, day) {
  return [month, day, year].filter(value => value !== null && value !== undefined && String(value).trim() !== '').join(' ') || 'Not recorded';
}

export async function fetchBaptismRecords(request, session, { page = 0, search = '' } = {}) {
  if (session?.role !== 'parish' || !session?.accessToken) throw new Error('Sign in as a parish administrator to view baptism records.');
  let parishId = session.parish_id;
  if (!parishId && session.email) {
    const parishes = await request('/rest/v1/rpc/get_parish_id_by_email', {
      method: 'POST', body: { p_email: session.email }, accessToken: session.accessToken,
    });
    if (Array.isArray(parishes) && parishes.length === 1) parishId = parishes[0].id;
  }
  if (!parishId) throw new Error('Your admin account is not linked to a parish. Contact your administrator to assign a parish before viewing records.');
  const query = new URLSearchParams({
    select: COLUMNS, parish_id: `eq.${parishId}`, order: 'created_at.desc.nullslast,id.desc',
    limit: String(PAGE_SIZE + 1), offset: String(Math.max(0, page) * PAGE_SIZE),
  });
  if (search.trim()) query.set('name', `ilike.%${search.trim().replace(/[\\%_*]/g, '\\$&')}%`);
  let result = await request(`/rest/v1/baptism_records?${query}`, { accessToken: session.accessToken });
  if (Array.isArray(result) && result.length === 0) {
    result = await request('/rest/v1/rpc/baptism_records_for_parish', {
      method: 'POST',
      body: { p_parish_id: parishId, p_search: search.trim() || null, p_limit: PAGE_SIZE + 1, p_offset: Math.max(0, page) * PAGE_SIZE },
      accessToken: session.accessToken,
    });
  }
  if (!Array.isArray(result)) throw new Error('The baptism records response was not a list. Please try again.');
  return { rows: result.slice(0, PAGE_SIZE), hasNext: result.length > PAGE_SIZE };
}

export function BaptismRecords({ session, React, ui, request }) {
  const { useState, useEffect } = React;
  const { jsx, jsxs } = ui;
  const [result, setResult] = useState({ rows: [], hasNext: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [recordType, setRecordType] = useState('baptism');
  useEffect(() => {
    if (recordType !== 'baptism') { setLoading(false); setError(''); setResult({ rows: [], hasNext: false }); return undefined; }
    let active = true;
    setLoading(true); setError(''); setResult({ rows: [], hasNext: false });
    fetchBaptismRecords(request, session, { page, search })
      .then(data => { if (active) setResult(data); })
      .catch(reason => { if (active) setError(reason.message || 'Could not load baptism records.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session?.parish_id, session?.email, session?.accessToken, session?.role, page, search, revision, recordType]);
  const field = (label, value) => jsxs('div', { children: [jsx('dt', { children: label }), jsx('dd', { children: value === null || value === undefined || value === '' ? 'Not recorded' : String(value) })] }, label);
  return jsx('div', { className: 'screen-grid', children: jsxs('article', {
    className: 'glass-card page-card screen-grid__full baptism-records', children: [
      jsxs('div', { className: 'glass-card__header', children: [jsxs('div', { children: [jsx('h4', { children: recordType === 'baptism' ? 'Baptism records' : 'Parish records' }), jsx('p', { className: 'page-card__lead', children: recordType === 'baptism' ? 'Baptism records saved for your parish.' : 'Choose a record type to view parish records.' })] }), jsxs('div', { className: 'baptism-records__tools', children: [jsxs('label', { className: 'baptism-records__type', children: [jsx('span', { children: 'Record type' }), jsxs('select', { value: recordType, onChange: event => { setRecordType(event.target.value); setPage(0); setSearch(''); setInput(''); }, children: [jsx('option', { value: 'baptism', children: 'Baptism records' }), jsx('option', { value: 'other', children: 'Other records' })] })] }), recordType === 'baptism' ? jsx('button', { type: 'button', className: 'secondary-action', disabled: loading, onClick: () => setRevision(value => value + 1), children: 'Refresh' }) : null] })] }),
      recordType === 'baptism' ? jsxs('form', { className: 'baptism-records__search', onSubmit: event => { event.preventDefault(); setPage(0); setSearch(input.trim()); setRevision(value => value + 1); }, children: [
        jsxs('label', { className: 'login-field', children: [jsx('span', { children: 'Search by name' }), jsx('input', { type: 'search', value: input, placeholder: 'Enter a name', onChange: event => setInput(event.target.value) })] }),
        jsx('button', { type: 'submit', className: 'primary-action', disabled: loading, children: 'Search' }),
      ] }) : jsx('div', { className: 'auth-notice auth-notice--info', role: 'status', children: [jsx('strong', { children: 'Use Parish Archive for other records' }), jsx('span', { children: 'Baptism records are fetched from the baptism_records table. Other sacramental records are managed in Parish Archive.' })] }),
      recordType === 'baptism' && error ? jsxs('div', { role: 'alert', children: [jsx('strong', { children: 'Could not load baptism records' }), jsx('p', { children: error })] }) : null,
      recordType === 'baptism' && (loading ? jsx('p', { role: 'status', children: 'Loading baptism records…' }) : !error && result.rows.length === 0 ? jsx('p', { role: 'status', children: search ? 'No baptism records match this name.' : 'No baptism records found for your parish.' }) : null),
      recordType === 'baptism' ? jsx('div', { className: 'baptism-records__list', children: result.rows.map(record => jsxs('section', {
        className: 'baptism-records__record', children: [
          jsx('h3', { children: record.name || 'Name not recorded' }),
          jsx('dl', { className: 'baptism-records__fields', children: [
            field('Date of baptism', recordDate(record.year_baptism, record.month_batism, record.date_batism)),
            field('Date of birth', recordDate(record.year_birth, record.month_birth, record.day_birth)),
            field('Mother', record.mother_name), field('Father', record.father_name),
          ] }),
          jsxs('details', { children: [jsx('summary', { children: 'View full record' }), jsx('dl', { className: 'baptism-records__fields', children: [
            field('Record number', record.id), field('Godparents', record.godparents),
            field('Forefathers', record.forefathers), field('Foremothers', record.foremothers),
            field('Location', record.location), field('Minister', record.minister),
            field('Fee', record.fee), field('Recorded on', record.created_at ? new Date(record.created_at).toLocaleString() : null),
          ] })] }),
        ],
      }, record.id)) }) : null,
      recordType === 'baptism' ? jsxs('nav', { className: 'baptism-records__pagination', 'aria-label': 'Baptism records pages', children: [
        jsx('button', { type: 'button', className: 'secondary-action', disabled: loading || page === 0, onClick: () => setPage(value => value - 1), children: 'Previous' }),
        jsx('span', { children: `Page ${page + 1}` }),
        jsx('button', { type: 'button', className: 'secondary-action', disabled: loading || !result.hasNext, onClick: () => setPage(value => value + 1), children: 'Next' }),
      ] }) : null,
    ],
  }) });
}
