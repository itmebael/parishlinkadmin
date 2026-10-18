export function RecordFormPreview({React:R, record, recordType, config, recordDate, onClose, onPrint, onDownload}) {
  const h = R.createElement;
  const dialog = R.useRef(null);
  R.useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  const value = input => input == null || String(input).trim() === '' ? 'Not recorded' : String(input);
  const field = (label, input, wide = false) => h('label', {key:label, className:'record-form-preview__field' + (wide ? ' is-wide' : '')},
    h('span', null, label), h('input', {readOnly:true, value:value(input), 'aria-label':label}));
  const names = (prefix, fullName, label) => {
    const first = record[prefix + 'first_name'], middle = record[prefix + 'middle_name'], last = record[prefix + 'last_name'];
    return first || middle || last ? h('div', {className:'record-form-preview__names'}, field('First Name', first), field('Middle Name', middle), field('Last Name', last)) : field(label, fullName, true);
  };
  const section = (title, children) => h('section', {className:'record-form-preview__section'}, h('h4', null, title), h('div', {className:'record-form-preview__grid'}, children));
  const baptism = recordType === 'baptism';
  const marriage = recordType === 'marriage';
  return h('dialog', {ref:dialog, className:'record-form-preview', 'aria-labelledby':'record-form-preview-title', onCancel:onClose, onClick:event => {
    if (event.target === event.currentTarget) {const bounds=event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();}
  }},
  h('header', {className:'record-form-preview__header'}, h('h3', {id:'record-form-preview-title'}, config.title.replace(/ records$/i, '') + ' Record Form'), h('button', {type:'button', className:'record-form-preview__close', title:'Close preview', 'aria-label':'Close preview', onClick:onClose}, '\u00d7')),
  section('Personal Information', [
    names('', record[config.name], marriage ? 'Name and Family Name' : 'Full Name'),
    baptism ? field('Date of Birth', recordDate(record.year_birth, record.month_birth, record.day_birth)) : field('Age', record.age),
    field(baptism ? 'Place of Birth' : 'Residence', record.place_of_birth || record.birth_place || record.origin_of_birth || (marriage ? record.residence : null)),
    field(marriage ? 'Date of Marriage' : baptism ? 'Date of Baptism' : 'Date of Confirmation', config.date ? record[config.date] : recordDate(record[config.year], record[config.month], baptism ? record.date_batism : record.date_baptism)),
    field(marriage ? 'Origin of Birth' : baptism ? 'Place of Baptism' : 'Place of Confirmation', marriage ? record.origin_of_birth : record.location),
    baptism ? field('Age Category', record.age_category) : null
  ]),
  section('Parents / Guardian Information', marriage ? [field('Parents', record.parents, true)] : [
    h('h5', {className:'record-form-preview__subheading', key:'father-heading'}, "Father's Name"), names('father_', record.father_name, "Father's Full Name"),
    h('h5', {className:'record-form-preview__subheading', key:'mother-heading'}, "Mother's Maiden Name"), names('mother_', record.mother_name, "Mother's Full Name")
  ]),
  section(marriage ? 'Witnesses' : 'Sponsors / Godparents', marriage ? [field('Witness 1', record.witness_1), field('Witness 2', record.witness_2)] : [field('Godparents', record.godparents, true), baptism ? field('Forefathers', record.forefathers) : null, baptism ? field('Foremothers', record.foremothers) : null]),
  section('Record Information', [field('Minister', record.minister), field('Record Number', record.id), field('Recorded On', record.created_at ? new Date(record.created_at).toLocaleDateString('en-US') : null), field(marriage ? 'Remarks' : 'Fee / Stipend', marriage ? record.remarks : record.fee ?? record.stipend)]),
  h('footer', {className:'record-form-preview__footer'}, h('button', {type:'button', className:'secondary-action', onClick:onDownload}, 'Download'), h('button', {type:'button', className:'primary-action', onClick:onPrint}, 'Print'), h('button', {type:'button', className:'secondary-action', onClick:onClose}, 'Close')));
}
