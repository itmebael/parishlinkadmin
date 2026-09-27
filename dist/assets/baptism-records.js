const PAGE_SIZE = 25;
const COLUMNS = 'id,year_baptism,month_batism,date_batism,name,year_birth,month_birth,day_birth,mother_name,father_name,forefathers,foremothers,godparents,location,fee,minister,created_at,parish_id';

const RECORD_TYPES = {
  baptism: { table: 'baptism_records', title: 'Baptism records', name: 'name', year: 'year_baptism', month: 'month_batism', fields: ['id','year_baptism','month_batism','date_batism','name','year_birth','month_birth','day_birth','mother_name','father_name','forefathers','foremothers','godparents','location','fee','minister','created_at'] },
  confirmation: { table: 'confirmation_records', title: 'Confirmation records', name: 'name', year: 'year_confirm', month: 'month_confirm', fields: ['id','year_confirm','month_confirm','date_baptism','name','age','location','location_baptism','mother_name','father_name','godparents','stipend','minister','created_at'] },
  marriage: { table: 'marriage_records', title: 'Marriage records', name: 'name_family_name', date: 'marriage_date', fields: ['id','entry_no','marriage_date','party_role','name_family_name','status','age','origin_of_birth','residence','parents','witness_1','witness_2','witness_residence','minister','remarks','created_at'] },
};
const LABELS = { id: 'Record number', year_baptism: 'Baptism year', month_batism: 'Baptism month', date_batism: 'Baptism day', name: 'Name', year_birth: 'Birth year', month_birth: 'Birth month', day_birth: 'Birth day', mother_name: 'Mother', father_name: 'Father', forefathers: 'Forefathers', foremothers: 'Foremothers', godparents: 'Godparents', location: 'Location', fee: 'Fee', minister: 'Minister', created_at: 'Recorded on', year_confirm: 'Confirmation year', month_confirm: 'Confirmation month', date_baptism: 'Baptism day', age: 'Age', location_baptism: 'Baptism location', stipend: 'Stipend', entry_no: 'Entry number', marriage_date: 'Marriage date', party_role: 'Party role', name_family_name: 'Name', status: 'Status', origin_of_birth: 'Origin of birth', residence: 'Residence', parents: 'Parents', witness_1: 'Witness 1', witness_2: 'Witness 2', witness_residence: 'Witness residence', remarks: 'Remarks' };

export function recordDate(year, month, day) {
  return [month, day, year].filter(value => value !== null && value !== undefined && String(value).trim() !== '').join(' ') || 'Not recorded';
}

async function parishIdFor(request, session) {
  let parishId = session.parish_id;
  if (!parishId && session.email) {
    const parishes = await request('/rest/v1/rpc/get_parish_id_by_email', { method: 'POST', body: { p_email: session.email }, accessToken: session.accessToken });
    if (Array.isArray(parishes) && parishes.length === 1) parishId = parishes[0].id;
  }
  if (!parishId) throw new Error('Your admin account is not linked to a parish. Contact your administrator to assign a parish before viewing records.');
  return parishId;
}

function addMonthFilter(query, column, month) {
  if (!month) return;
  const name = new Date(2020, Number(month) - 1, 1).toLocaleString('en', { month: 'long' });
  query.append('or', `(${column}.eq.${Number(month)},${column}.eq.${String(Number(month)).padStart(2, '0')},${column}.ilike.${name})`);
}

export async function fetchSacramentalRecords(request, session, { page = 0, search = '', searchBy = 'name', recordType = 'baptism', month = '', year = '' } = {}) {
  if (session?.role !== 'parish' || !session?.accessToken) throw new Error('Sign in as a parish administrator to view parish records.');
  const config = RECORD_TYPES[recordType];
  if (!config) throw new Error('Choose a supported sacramental record type.');
  const parishId = await parishIdFor(request, session);
  const query = new URLSearchParams({ select: recordType === 'baptism' ? COLUMNS : '*', parish_id: `eq.${parishId}`, order: 'created_at.desc.nullslast,id.desc', limit: String(PAGE_SIZE + 1), offset: String(Math.max(0, page) * PAGE_SIZE) });
  if (config.date) {
    if (year && month) {
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(Number(year), Number(month), 1);
      query.set(`${config.date}`, `gte.${start}`);
      query.set('and', `(${config.date}.lt.${endDate.toISOString().slice(0, 10)})`);
    } else if (year) {
      query.set(config.date, `gte.${year}-01-01`);
      query.append('and', `(${config.date}.lt.${Number(year) + 1}-01-01)`);
    } else if (month) {
      query.set(config.date, `gte.0001-${String(month).padStart(2, '0')}-01`);
      query.append('and', `(${config.date}.lt.9999-${String(Number(month) + 1 > 12 ? 1 : Number(month) + 1).padStart(2, '0')}-01)`);
    }
  } else {
    if (year) query.set(config.year, `eq.${Number(year)}`);
    addMonthFilter(query, config.month, month);
  }
  if (search.trim()) {
    const escaped = search.trim().replace(/[\\%_*]/g, '\\$&');
    const searchColumns = recordType === 'baptism' ? { name: 'name', mother: 'mother_name', father: 'father_name', godparents: 'godparents', minister: 'minister', location: 'location' }
      : recordType === 'confirmation' ? { name: 'name', mother: 'mother_name', father: 'father_name', godparents: 'godparents', minister: 'minister', location: 'location' }
        : { name: 'name_family_name', role: 'party_role', status: 'status', minister: 'minister', location: 'residence' };
    if (searchColumns[searchBy]) query.set(searchColumns[searchBy], `ilike.%${escaped}%`);
    else if (recordType === 'baptism' && ['birthDate', 'baptismDate'].includes(searchBy)) {
      const [searchYear, searchMonth, day] = search.trim().split('-');
      if (searchYear && searchMonth && day) {
        const fields = searchBy === 'birthDate' ? ['year_birth', 'month_birth', 'day_birth'] : ['year_baptism', 'month_batism', 'date_batism'];
        query.set(fields[0], `eq.${Number(searchYear)}`);
        const monthName = new Date(Number(searchYear), Number(searchMonth) - 1, 1).toLocaleString('en', { month: 'long' });
        query.append('or', `(${fields[1]}.eq.${Number(searchMonth)},${fields[1]}.eq.${String(Number(searchMonth)).padStart(2, '0')},${fields[1]}.ilike.${monthName})`);
        query.set(fields[2], `eq.${Number(day)}`);
      }
    }
  }
  let result = await request(`/rest/v1/${config.table}?${query}`, { accessToken: session.accessToken });
  if (recordType === 'baptism' && Array.isArray(result) && result.length === 0 && searchBy === 'name' && !month && !year && search.trim()) {
    result = await request('/rest/v1/rpc/baptism_records_for_parish', { method: 'POST', body: { p_parish_id: parishId, p_search: search.trim(), p_limit: PAGE_SIZE + 1, p_offset: Math.max(0, page) * PAGE_SIZE }, accessToken: session.accessToken });
  }
  if (!Array.isArray(result)) throw new Error('The parish records response was not a list. Please try again.');
  return { rows: result.slice(0, PAGE_SIZE), hasNext: result.length > PAGE_SIZE };
}

export async function fetchBaptismRecords(request, session, options = {}) {
  return fetchSacramentalRecords(request, session, options);
}

function groupMarriageRecords(rows) {
  const groups = new Map();
  for (const record of rows) {
    const key = record.entry_no == null || record.entry_no === '' ? `record-${record.id}` : `entry-${record.entry_no}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return Array.from(groups, ([key, records]) => {
    const groom = records.find(record => /groom/i.test(record.party_role || '')) || records[0];
    const bride = records.find(record => /bride/i.test(record.party_role || '')) || records.find(record => record !== groom) || null;
    return { key, groom, bride, primary: groom || records[0] };
  });
}

function downloadRecord(record, config) {
  const headers = config.fields;
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(key => escape(LABELS[key] || key)).join(','), ...[record].map(item => headers.map(key => escape(item[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${config.title.toLowerCase().replace(/\s+/g, '-')}-${record.id || 'record'}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadRecords(records, config) {
  const headers = config.fields;
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(key => escape(LABELS[key] || key)).join(','), ...records.map(record => headers.map(key => escape(record[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${config.title.toLowerCase().replace(/\s+/g, '-')}-filtered.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BaptismRecords({ session, React, ui, request }) {
  const { useState, useEffect } = React;
  const { jsx, jsxs } = ui;
  const [result, setResult] = useState({ rows: [], hasNext: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchBy, setSearchBy] = useState('name');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [previewRows, setPreviewRows] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [recordType, setRecordType] = useState('baptism');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const config = RECORD_TYPES[recordType];
  const visibleRecords = recordType === 'marriage'
    ? groupMarriageRecords(result.rows)
    : result.rows.map(record => ({ key: record.id, primary: record }));
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setResult({ rows: [], hasNext: false });
    fetchSacramentalRecords(request, session, { page, search, searchBy, recordType, month, year })
      .then(data => { if (active) setResult(data); })
      .catch(reason => { if (active) setError(reason.message || `Could not load ${config.title.toLowerCase()}.`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session?.parish_id, session?.email, session?.accessToken, session?.role, page, search, searchBy, revision, recordType, month, year]);
  const field = (key, value) => jsxs('div', { children: [jsx('dt', { children: LABELS[key] || key }), jsx('dd', { children: value === null || value === undefined || value === '' ? 'Not recorded' : String(value) })] }, key);
  const resetPage = setter => value => { setter(value); setPage(0); };
  const openFilteredPreview = async () => {
    setPreviewLoading(true);
    try {
      let allRows = [];
      let currentPage = 0;
      let hasNext = true;
      while (hasNext) {
        const data = await fetchSacramentalRecords(request, session, { page: currentPage, search: input.trim(), searchBy, recordType, month, year });
        allRows = allRows.concat(data.rows);
        hasNext = data.hasNext;
        currentPage += 1;
      }
      setSearch(input.trim());
      setPreviewRows(allRows);
    } catch (reason) {
      setError(reason.message || 'Could not prepare the filtered preview.');
    } finally {
      setPreviewLoading(false);
    }
  };
  return jsx('div', { className: 'screen-grid', children: jsxs('article', { className: 'glass-card page-card screen-grid__full baptism-records', children: [
    jsxs('div', { className: 'glass-card__header', children: [jsxs('div', { children: [jsx('h4', { children: config.title }), jsx('p', { className: 'page-card__lead', children: `${config.title} saved for your parish.` })] }), jsxs('div', { className: 'baptism-records__tools', children: [jsxs('label', { className: 'baptism-records__type', children: [jsx('span', { children: 'Record type' }), jsxs('select', { value: recordType, onChange: event => { setRecordType(event.target.value); setPage(0); setSearch(''); setInput(''); setMonth(''); setYear(''); setSelectedRecord(null); }, children: [jsx('option', { value: 'baptism', children: 'Baptism records' }), jsx('option', { value: 'confirmation', children: 'Confirmation records' }), jsx('option', { value: 'marriage', children: 'Marriage records' })] })] }), jsx('button', { type: 'button', className: 'secondary-action', disabled: loading, onClick: () => setRevision(value => value + 1), children: 'Refresh' })] })] }),
    jsxs('form', { className: 'baptism-records__search', onSubmit: event => { event.preventDefault(); setPage(0); setSearch(input.trim()); setRevision(value => value + 1); }, children: [
      jsxs('label', { className: 'login-field', children: [jsx('span', { children: 'Search name' }), jsx('input', { type: 'search', value: input, placeholder: 'Enter a name', onChange: event => setInput(event.target.value) })] }),
      jsxs('label', { className: 'login-field', children: [jsx('span', { children: 'Month' }), jsxs('select', { value: month, onChange: event => resetPage(setMonth)(event.target.value), children: [jsx('option', { value: '', children: 'All months' }), ...Array.from({ length: 12 }, (_, index) => jsx('option', { value: String(index + 1), children: new Date(2020, index, 1).toLocaleString('en', { month: 'long' }) }, index))] })] }),
      jsxs('label', { className: 'login-field', children: [jsx('span', { children: 'Year' }), jsx('input', { type: 'number', min: '1000', max: '9999', value: year, placeholder: 'All years', onChange: event => resetPage(setYear)(event.target.value) })] }),
      jsx('button', { type: 'submit', className: 'primary-action', disabled: loading, children: 'Search' }),
      jsx('button', { type: 'button', className: 'secondary-action', disabled: loading || previewLoading, onClick: openFilteredPreview, children: previewLoading ? 'Preparing…' : 'Preview download' }),
    ] }),
    error ? jsxs('div', { role: 'alert', children: [jsx('strong', { children: `Could not load ${config.title.toLowerCase()}` }), jsx('p', { children: error })] }) : null,
    loading ? jsx('p', { role: 'status', children: `Loading ${config.title.toLowerCase()}…` }) : !error && result.rows.length === 0 ? jsx('p', { role: 'status', children: search || month || year ? 'No records match these filters.' : `No ${config.title.toLowerCase()} found for your parish.` }) : null,
    jsx('div', { className: 'baptism-records__list', children: visibleRecords.map(group => {
      const record = group.primary;
      const names = recordType === 'marriage'
        ? [group.groom ? `Groom: ${group.groom.name_family_name || 'Name not recorded'}` : null, group.bride ? `Bride: ${group.bride.name_family_name || 'Name not recorded'}` : null].filter(Boolean)
        : [record[config.name] || 'Name not recorded'];
      return jsxs('button', { type: 'button', className: 'baptism-records__record baptism-records__row', 'aria-label': `Open full record for ${names.join(' and ')}`, onClick: () => setSelectedRecord(record), children: [jsx('strong', { children: names[0] }), ...names.slice(1).map((name, index) => jsx('strong', { children: name }, `party-${index}`)), jsx('span', { children: config.date ? `${LABELS[config.date]}: ${record[config.date] || 'Not recorded'}` : `${config.title.split(' ')[0]}: ${recordDate(record[config.year], record[config.month], recordType === 'baptism' ? record.date_batism : record.date_baptism)}` }), jsx('span', { children: `${LABELS[recordType === 'marriage' ? 'minister' : 'location']}: ${record[recordType === 'marriage' ? 'minister' : 'location'] || 'Not recorded'}` }), jsx('span', { className: 'baptism-records__row-hint', children: 'Preview' })] }, group.key);
    }) }),
    selectedRecord ? jsx('div', { className: 'baptism-records__modal-backdrop', onClick: event => { if (event.target === event.currentTarget) setSelectedRecord(null); }, children: jsxs('section', { className: 'baptism-records__modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'baptism-record-popup-title', children: [jsxs('header', { className: 'baptism-records__modal-header', children: [jsx('h3', { id: 'baptism-record-popup-title', children: selectedRecord[config.name] || config.title }), jsxs('div', { className: 'baptism-records__modal-actions', children: [jsx('button', { type: 'button', className: 'primary-action', onClick: () => downloadRecord(selectedRecord, config), children: 'Download' }), jsx('button', { type: 'button', className: 'secondary-action', onClick: () => setSelectedRecord(null), children: 'Cancel' })] })] }), jsx('dl', { className: 'baptism-records__fields', children: config.fields.map(key => field(key, selectedRecord[key])) })] }) }) : null,
    previewRows ? jsx('div', { className: 'baptism-records__modal-backdrop', onClick: event => { if (event.target === event.currentTarget) setPreviewRows(null); }, children: jsxs('section', { className: 'baptism-records__modal baptism-records__filtered-preview', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'baptism-filter-preview-title', children: [jsxs('header', { className: 'baptism-records__modal-header', children: [jsxs('div', { children: [jsx('h3', { id: 'baptism-filter-preview-title', children: 'Filtered records preview' }), jsx('p', { children: `${previewRows.length} matching ${config.title.toLowerCase()}` })] }), jsxs('div', { className: 'baptism-records__modal-actions', children: [jsx('button', { type: 'button', className: 'primary-action', disabled: previewRows.length === 0, onClick: () => downloadRecords(previewRows, config), children: 'Download CSV' }), jsx('button', { type: 'button', className: 'secondary-action', onClick: () => setPreviewRows(null), children: 'Cancel' })] })] }), jsx('div', { className: 'baptism-records__filtered-preview-list', children: previewRows.length ? previewRows.map(record => jsxs('article', { children: [jsx('strong', { children: record[config.name] || 'Name not recorded' }), ...config.fields.filter(key => key !== config.name && key !== 'id').slice(0, 4).map(key => jsx('span', { children: `${LABELS[key] || key}: ${record[key] ?? 'Not recorded'}` }, key))] }, record.id)) : jsx('p', { children: 'No records match these filters.' }) })] }) }) : null,
    jsx('nav', { className: 'baptism-records__pagination', 'aria-label': `${config.title} pages`, children: [jsx('button', { type: 'button', className: 'secondary-action', disabled: loading || page === 0, onClick: () => setPage(value => value - 1), children: 'Previous' }), jsx('span', { children: `Page ${page + 1}` }), jsx('button', { type: 'button', className: 'secondary-action', disabled: loading || !result.hasNext, onClick: () => setPage(value => value + 1), children: 'Next' })] }),
  ] }) });
}
