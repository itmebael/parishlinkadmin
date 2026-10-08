export const BULLETIN_CATEGORIES = ['Project transparency', 'Donations & contributions', 'Visiting priests', 'Fundraising', 'Parish matters'];
export const ANNOUNCEMENT_CATEGORIES = ['Notice', 'Financial Report'];
export const BUCKET = 'parish-post-attachments';
const TYPES = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',pdf:'application/pdf',txt:'text/plain',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
export function validateFiles(files, existing = 0) {
  if (files.length + existing > 10) throw new Error('Attach up to 10 files per post.');
  let total = 0;
  return files.map(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    const type = TYPES[ext];
    if (!type || (file.type && file.type !== type && file.type !== 'application/octet-stream')) throw new Error('Use JPG, PNG, WebP, GIF, PDF, TXT, DOCX, or XLSX files.');
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Each file must be between 1 byte and 10 MB.');
    total += file.size;
    if (total > 50 * 1024 * 1024) throw new Error('Upload no more than 50 MB at once.');
    return {file, type, ext};
  });
}
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
const blank = kind => ({title:'', content:'', activities:[{date:'', activity:''}], category:kind === 'bulletin' ? 'Parish matters' : 'Notice', status:'Draft', attachments:[]});
export function announcementActivities(row) {
  const lines = (row.content || '').split('\n');
  if (lines.length && lines.every(line => /^\d{4}-\d{2}-\d{2}\t.+$/.test(line))) {
    return lines.map(line => ({date:line.slice(0, 10), activity:line.slice(11)}));
  }
  return [{date:(row.published_at || row.created_at || '').slice(0, 10), activity:[row.title, row.content].filter(Boolean).join(' — ')}];
}
export function announcementDraft(draft) {
  if (!draft.activities?.length) throw new Error('Add at least one date and activity.');
  const activities = draft.activities.map(({date, activity}) => {
    const value = activity.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !value) throw new Error('Complete the date and activity in every row.');
    if (/[\r\n\t]/.test(value)) throw new Error('Keep each activity on one line.');
    return {date, activity:value};
  });
  return {...draft, title:activities[0].activity.slice(0, 200), content:activities.map(item => item.date + '\t' + item.activity).join('\n')};
}
export function AnnouncementBoardTable({React:R, rows, busy, onEdit, onDelete, attachments}) {
  const h = R.createElement;
  return h('div', {className:'announcement-table-wrap announcement-board-scroll'}, h('table', {className:'announcement-table announcement-board-table'},
    h('caption', {className:'announcement-table-caption'}, 'Parish announcements, publication status, and actions'),
    h('thead', null, h('tr', null, ['Petsa', 'Aktibidades', 'Status', 'Actions'].map(label => h('th', {key:label, scope:'col'}, label)))),
    rows.map(row => {
      const items = announcementActivities(row);
      return h('tbody', {key:row.id}, items.map((item, index) => h('tr', {key:index},
        h('td', null, item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'}) : '—'),
        h('td', null, h('span', {className:'announcement-board-activity'}, item.activity), index === 0 && attachments ? attachments(row) : null),
        index === 0 ? h('td', {rowSpan:items.length},
          h('span', {className:'status-badge status-badge--' + (row.status === 'Published' ? 'green' : 'blue')}, row.status),
          h('small', {className:'announcement-board-posted'}, 'Posted ' + new Date(row.published_at || row.created_at).toLocaleDateString())) : null,
        index === 0 ? h('td', {rowSpan:items.length}, h('div', {className:'announcement-board-actions'},
          h('button', {type:'button', className:'secondary-action', disabled:busy, onClick:() => onEdit(row), 'aria-label':'Edit ' + row.title}, 'Edit'),
          h('button', {type:'button', className:'secondary-action announcement-board-delete', disabled:busy, onClick:() => onDelete(row), 'aria-label':'Delete ' + row.title}, 'Delete'))) : null)));
    })));
}
export function postAttachments(row) {
  const items = [...(Array.isArray(row.attachments) ? row.attachments : [])];
  for (const photo of Array.isArray(row.photo_urls) ? row.photo_urls : []) {
    if (typeof photo === 'string' && /^https:\/\//.test(photo) && !items.some(a => a.url === photo)) items.push({url:photo, name:'Photo', type:'image/jpeg'});
  }
  return items;
}
export function publishingPayload(kind, draft, parish, attachments, id) {
  const title = draft.title.trim(), content = draft.content.trim();
  if (!title || title.length > 200) throw new Error('Use a title between 1 and 200 characters.');
  if (kind === 'bulletin' && !content) throw new Error('Add the bulletin content before saving.');
  if (content.length > 20000) throw new Error('Keep the content within 20,000 characters.');
  if (!(kind === 'bulletin' ? BULLETIN_CATEGORIES : ANNOUNCEMENT_CATEGORIES).includes(draft.category)) throw new Error('Choose a valid category.');
  if (!['Draft','Published','Archived'].includes(draft.status)) throw new Error('Choose a valid status.');
  const result = {title, content, category:draft.category, status:draft.status, attachments,
    photo_urls:attachments.filter(a => a.type.startsWith('image/')).map(a => a.url)};
  if (!draft.id) result.id = id;
  if (kind === 'bulletin') result.parish_id = parish.id;
  else {result.parish_name = parish.parish_name; result.audience = 'Parish Members';}
  return result;
}
function readableError(error) {
  const message = error.message || 'Something went wrong. Please try again.';
  if (/schema cache|does not exist|could not find.*column|bucket not found/i.test(message)) return 'Publishing setup is missing. Run sql/parish_publishing.sql in Supabase SQL Editor, then refresh this page.';
  return message;
}
function Attachment({React:R, request, token, url, item}) {
  const h = R.createElement;
  const [link, setLink] = R.useState(''), [error, setError] = R.useState('');
  R.useEffect(() => {
    let active = true;
    setLink(''); setError('');
    if (!item.path) {if (/^https:\/\//.test(item.url || '')) setLink(item.url); return;}
    request('/storage/v1/object/sign/' + BUCKET + '/' + encodePath(item.path), {method:'POST', accessToken:token, body:{expiresIn:3600}})
      .then(data => {if (active) {const signed = data.signedURL || data.signedUrl; if (!signed) throw new Error('Attachment unavailable.'); setLink(signed.startsWith('https://') ? signed : url + '/storage/v1' + signed);}})
      .catch(e => {if (active) setError(e.message || 'Attachment unavailable.');});
    return () => {active = false;};
  }, [item.path, item.url, token]);
  return h('div', {className:'publishing-attachment'},
    link && item.type?.startsWith('image/') ? h('a', {href:link, target:'_blank', rel:'noopener noreferrer'}, h('img', {src:link, alt:item.name || 'Post image', loading:'lazy'})) : null,
    link ? h('a', {href:link, target:'_blank', rel:'noopener noreferrer'}, item.name || 'Open attachment') : h('span', null, item.name || 'Attachment'),
    error ? h('small', {role:'status'}, error) : !link ? h('small', null, 'Loading attachment…') : null);
}
export function ParishPublishing({React:R, request, getHeaders, url, session}) {
  const h = R.createElement;
  const token = session?.accessToken;
  const [kind, setKind] = R.useState('announcement'), [parish, setParish] = R.useState(null);
  const [rows, setRows] = R.useState([]), [draft, setDraft] = R.useState(() => blank('announcement'));
  const [files, setFiles] = R.useState([]), [busy, setBusy] = R.useState(false), [loading, setLoading] = R.useState(true);
  const [notice, setNotice] = R.useState(null);
  const fileInput = R.useRef(null), formRef = R.useRef(null), generation = R.useRef(0);
  const table = kind === 'bulletin' ? 'parish_bulletins' : 'diocese_announcements';
  const noun = kind === 'bulletin' ? 'Bulletin' : 'Announcement';
  const scope = p => kind === 'bulletin' ? 'parish_id=eq.' + encodeURIComponent(p.id) : 'parish_name=eq.' + encodeURIComponent(p.parish_name);
  const rest = (path, options = {}) => request(path, {...options, accessToken:token});
  async function readRows(p) {
    const result = [];
    for (let offset = 0; ; offset += 500) {
      const batch = await rest('/rest/v1/' + table + '?select=*&' + scope(p) + '&order=created_at.desc,id.desc&limit=500&offset=' + offset);
      result.push(...batch);
      if (batch.length < 500) return result;
    }
  }
  R.useEffect(() => {
    const current = ++generation.current;
    setLoading(true); setRows([]); setParish(null); setNotice(null);
    (async () => {
      try {
        if (!token) throw new Error('Sign in again before publishing parish posts.');
        const user = await rest('/auth/v1/user');
        if (!user.email_confirmed_at) throw new Error('Verify your parish login email before publishing.');
        const parishes = await rest('/rest/v1/parishes?select=id,parish_name&email=eq.' + encodeURIComponent(user.email) + '&limit=2');
        if (parishes.length !== 1) throw new Error('Your verified login email must match one parish publishing account.');
        const posts = await readRows(parishes[0]);
        if (current === generation.current) {setParish(parishes[0]); setRows(posts);}
      } catch (e) {if (current === generation.current) setNotice({error:true, text:readableError(e)});}
      finally {if (current === generation.current) setLoading(false);}
    })();
    return () => {generation.current++;};
  }, [kind, token]);
  function reset() {setDraft(blank(kind)); setFiles([]); if (fileInput.current) fileInput.current.value = '';}
  async function removeObjects(paths) {
    if (paths.length) await rest('/storage/v1/object/' + BUCKET, {method:'DELETE', body:{prefixes:paths}});
  }
  async function save(event) {
    event.preventDefault();
    if (busy || !parish) return;
    let uploaded = [], committed = false;
    try {
      const id = draft.id || crypto.randomUUID();
      const savingDraft = kind === 'announcement' ? announcementDraft(draft) : draft;
      publishingPayload(kind, savingDraft, parish, draft.attachments, id);
      const checked = validateFiles(files, draft.attachments.length);
      setBusy(true); setNotice({text:'Saving ' + noun.toLowerCase() + '…'});
      for (const {file, type, ext} of checked) {
        const path = parish.id + '/' + kind + '/' + id + '/' + crypto.randomUUID() + '.' + ext;
        const response = await fetch(url + '/storage/v1/object/' + BUCKET + '/' + encodePath(path), {method:'POST', headers:{...getHeaders(token), 'Content-Type':type, 'x-upsert':'false'}, body:file});
        if (!response.ok) {const data = await response.json().catch(() => ({})); throw new Error(data.message || data.error || 'Could not upload ' + file.name);}
        uploaded.push({path, name:file.name, type, size:file.size, url:url + '/storage/v1/object/authenticated/' + BUCKET + '/' + encodePath(path)});
      }
      const attachments = [...draft.attachments, ...uploaded];
      const payload = publishingPayload(kind, savingDraft, parish, attachments, id);
      const target = '/rest/v1/' + table + (draft.id ? '?id=eq.' + encodeURIComponent(draft.id) + '&' + scope(parish) : '');
      const saved = await rest(target, {method:draft.id ? 'PATCH' : 'POST', headers:{Prefer:'return=representation'}, body:payload});
      if (!Array.isArray(saved) || saved.length !== 1) throw new Error('The post was not saved. Check parish publishing permissions.');
      committed = true;
      const previous = rows.find(row => row.id === draft.id);
      const removed = (previous?.attachments || []).filter(a => a.path && !attachments.some(b => b.path === a.path));
      setRows(previous ? rows.map(row => row.id === saved[0].id ? saved[0] : row) : [saved[0], ...rows]);
      reset();
      let cleanup = '';
      try {await removeObjects(removed.map(a => a.path));} catch {cleanup = ' Some removed files could not be cleaned up from storage.';}
      setNotice({text:noun + ' saved as ' + payload.status + '.' + cleanup});
    } catch (e) {
      let cleanup = '';
      if (!committed) try {await removeObjects(uploaded.map(a => a.path));} catch {cleanup = ' Uploaded files could not be cleaned up. Contact your storage administrator.';}
      setNotice({error:true, text:readableError(e) + cleanup});
    } finally {setBusy(false);}
  }
  async function deletePost(row) {
    if (!window.confirm('Delete this ' + noun.toLowerCase() + '? This cannot be undone.')) return;
    setBusy(true);
    try {
      const deleted = await rest('/rest/v1/' + table + '?id=eq.' + encodeURIComponent(row.id) + '&' + scope(parish), {method:'DELETE', headers:{Prefer:'return=representation'}});
      if (!Array.isArray(deleted) || deleted.length !== 1) throw new Error('The post was not deleted. Check your parish permissions.');
      setRows(rows.filter(r => r.id !== row.id)); if (draft.id === row.id) reset();
      let cleanup = '';
      try {await removeObjects((row.attachments || []).filter(a => a.path).map(a => a.path));} catch {cleanup = ' Some attachments could not be removed from storage.';}
      setNotice({text:noun + ' deleted.' + cleanup});
    } catch (e) {setNotice({error:true, text:readableError(e)});} finally {setBusy(false);}
  }
  function switchKind(next) {
    if (next === kind || busy) return;
    if ((draft.title || draft.content || draft.activities?.some(item => item.date || item.activity) || files.length || draft.id) && !window.confirm('Discard your unsaved changes?')) return;
    setKind(next); setDraft(blank(next)); setFiles([]); if (fileInput.current) fileInput.current.value = '';
  }
  function editPost(row) {
    if ((draft.title || draft.content || draft.activities?.some(item => item.date || item.activity) || files.length) && !window.confirm('Discard your unsaved changes?')) return;
    setDraft({...blank(kind), ...row, activities:kind === 'announcement' ? announcementActivities(row) : blank(kind).activities, attachments:postAttachments(row)});
    setFiles([]); if (fileInput.current) fileInput.current.value = '';
    formRef.current?.scrollIntoView({behavior:'smooth', block:'start'});
  }
  const field = (label, control) => h('label', {className:'login-field'}, h('span', null, label), control);
  const update = key => event => setDraft({...draft, [key]:event.target.value});
  const updateActivity = (index, key, value) => setDraft(current => ({...current, activities:current.activities.map((item, i) => i === index ? {...item, [key]:value} : item)}));
  const activityTable = (items, editable = false) => h('div', {className:'announcement-table-wrap'},
    h('table', {className:'announcement-table'},
      h('caption', {className:'announcement-table-caption'}, editable ? 'Announcement dates and activities to save' : 'Parish announcement dates and activities'),
      h('thead', null, h('tr', null, h('th', {scope:'col'}, 'Petsa'), h('th', {scope:'col'}, 'Aktibidades'))),
      h('tbody', null, items.map((item, index) => h('tr', {key:index},
        h('td', null, editable ? h('input', {type:'date', required:true, value:item.date, 'aria-label':'Petsa, row ' + (index + 1), onChange:event => updateActivity(index, 'date', event.target.value)}) : item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'}) : '—'),
        h('td', null, editable ? h('div', {className:'announcement-activity-input'},
          h('input', {type:'text', required:true, maxLength:2000, placeholder:'Ilagay ang aktibidad', value:item.activity, 'aria-label':'Aktibidades, row ' + (index + 1), onChange:event => updateActivity(index, 'activity', event.target.value)}),
          items.length > 1 ? h('button', {type:'button', className:'announcement-remove-row', 'aria-label':'Remove row ' + (index + 1), onClick:() => setDraft(current => ({...current, activities:current.activities.filter((_, i) => i !== index)}))}, '×') : null) : item.activity))))));
  const attachmentNodes = row => {
    const items = postAttachments(row);
    return h('div', {className:'publishing-attachments'}, items.map((item, i) => h(Attachment, {key:item.path || item.url || i, React:R, request, token, url, item})));
  };
  return h('div', {className:'parish-publishing' + (kind === 'announcement' ? ' parish-publishing--announcements' : '')},
    h('div', {className:'publishing-tabs', role:'tablist', 'aria-label':'Parish posts'}, ['announcement','bulletin'].map(value => h('button', {key:value, type:'button', role:'tab', 'aria-selected':kind === value, 'aria-controls':'parish-post-panel', disabled:busy, onClick:() => switchKind(value)}, value === 'bulletin' ? 'Bulletins' : 'Announcements'))),
    notice ? h('p', {className:'publishing-notice' + (notice.error ? ' is-error' : ''), role:notice.error ? 'alert' : 'status'}, notice.text) : null,
    h('div', {id:'parish-post-panel', role:'tabpanel', 'aria-label':noun + ' publishing', className:'publishing-layout'},
      h('article', {className:'glass-card page-card publishing-compose'},
        h('h4', null, (draft.id ? 'Edit Parish ' : 'Create Parish ') + noun),
        h('p', null, kind === 'bulletin' ? 'Post parish updates, project reports, donations, and community matters.' : 'Ilagay ang petsa at aktibidad. Add another row for each parish activity.'),
        h('form', {ref:formRef, onSubmit:save}, h('fieldset', {disabled:busy || loading || !parish},
          kind === 'announcement' ? h('div', {className:'announcement-editor'}, activityTable(draft.activities, true), h('button', {type:'button', className:'secondary-action announcement-add-row', onClick:() => setDraft(current => ({...current, activities:[...current.activities, {date:'', activity:''}]}))}, '+ Add row')) : field('Title', h('input', {name:'title', value:draft.title, onChange:update('title'), required:true, maxLength:200})),
          kind === 'bulletin' ? field('Category', h('select', {name:'category', value:draft.category, onChange:update('category')}, BULLETIN_CATEGORIES.map(c => h('option', {key:c}, c)))) : null,
          field('Status', h('select', {name:'status', value:draft.status, onChange:update('status')}, ['Draft','Published','Archived'].map(s => h('option', {key:s}, s)))),
          kind === 'bulletin' ? field('Content', h('textarea', {name:'content', value:draft.content, onChange:update('content'), rows:6, maxLength:20000, required:true})) : null,
          field('Images or files', h('input', {ref:fileInput, type:'file', multiple:true, accept:'.jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.docx,.xlsx', onChange:event => {const selected = [...event.target.files]; try {validateFiles(selected, draft.attachments.length); setFiles(selected);} catch(e) {event.target.value = ''; setFiles([]); setNotice({error:true, text:e.message});}}})),
          h('small', null, 'Up to 10 attachments. Maximum 10 MB per file; 50 MB per upload.'),
          h('ul', {className:'publishing-file-list'}, draft.attachments.map((a, i) => h('li', {key:a.path || i}, a.name || 'Attachment', h('button', {type:'button', onClick:() => setDraft({...draft, attachments:draft.attachments.filter((_, j) => j !== i)})}, 'Remove'))), files.map((f, i) => h('li', {key:'new-' + i}, f.name, h('button', {type:'button', onClick:() => setFiles(files.filter((_, j) => j !== i))}, 'Remove')))),
          h('div', {className:'publishing-actions'}, h('button', {type:'submit', className:'primary-action'}, busy ? 'Saving…' : 'Save Parish ' + noun), draft.id ? h('button', {type:'button', className:'secondary-action', onClick:reset}, 'Cancel') : null)))),
      h('article', {className:'glass-card page-card publishing-board'},
        h('h4', null, kind === 'bulletin' ? 'Bulletin Board' : 'Notice Board'),
        h('p', null, kind === 'bulletin' ? 'Review parish bulletins and their publication status.' : 'Review the announcements parish members will receive.'),
        loading ? h('p', {role:'status'}, 'Loading ' + noun.toLowerCase() + 's…') : rows.length === 0 ? h('div', {className:'empty-state'}, 'No parish ' + noun.toLowerCase() + 's yet.') : kind === 'announcement' ? h(AnnouncementBoardTable, {React:R, rows, busy, onEdit:editPost, onDelete:deletePost, attachments:attachmentNodes}) : rows.map(row => h('section', {key:row.id, className:'publishing-post'},
          h('div', {className:'publishing-post-meta'}, h('span', null, row.category || 'Notice'), h('span', {className:'status-badge status-badge--' + (row.status === 'Published' ? 'green' : 'blue')}, row.status)),
          kind === 'announcement' ? activityTable(announcementActivities(row)) : h(R.Fragment, null, h('h5', null, row.title), h('p', {className:'publishing-post-content'}, row.content || 'No announcement details saved.')), attachmentNodes(row),
          h('small', null, new Date(row.published_at || row.created_at).toLocaleString()),
          h('div', {className:'publishing-actions'}, h('button', {type:'button', className:'secondary-action', disabled:busy, onClick:() => {if ((draft.title || draft.content || draft.activities?.some(item => item.date || item.activity) || files.length) && !window.confirm('Discard your unsaved changes?')) return; setDraft({...blank(kind), ...row, activities:kind === 'announcement' ? announcementActivities(row) : blank(kind).activities, attachments:postAttachments(row)}); setFiles([]); if(fileInput.current) fileInput.current.value = ''; formRef.current?.scrollIntoView({behavior:'smooth', block:'start'});}}, 'Edit'), h('button', {type:'button', className:'secondary-action', disabled:busy, onClick:() => deletePost(row)}, 'Delete')))))));
}
