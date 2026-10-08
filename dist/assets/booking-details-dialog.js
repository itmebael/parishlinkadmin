export function bookingDetails(booking) {
  const fields = [['reference_number','Reference number'],['service_name','Service'],['booking_status','Status'],['booking_date','Booking date'],['booking_time','Booking time'],['parish_name','Parish'],['mother_name','Mother'],['father_name','Father'],['requester_birthday','Birthday'],['requester_age','Age'],['requester_gender','Gender'],['requester_address','Address'],['cost','Cost']];
  return fields.map(([key, label]) => ({label, value:booking[key] == null || booking[key] === '' ? 'Not recorded' : String(booking[key])}));
}
export function BookingDetailsDialog({React:R, booking, onClose}) {
  const h = R.createElement, ref = R.useRef(null);
  R.useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {if (dialog?.open) dialog.close();};
  }, []);
  return h('dialog', {ref, className:'parish-booking-dialog', 'aria-labelledby':'parish-booking-dialog-title', onCancel:onClose, onClick:event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }},
    h('header', {className:'parish-booking-dialog__header'}, h('div', null, h('small', null, 'Booking information'), h('h3', {id:'parish-booking-dialog-title'}, booking.client_name || 'Booking details')), h('button', {type:'button', className:'secondary-action', onClick:onClose, 'aria-label':'Close booking information'}, 'Close')),
    h('dl', {className:'parish-booking-dialog__details'}, bookingDetails(booking).map(({label,value}) => h('div', {key:label}, h('dt', null, label), h('dd', null, value)))),
    h('footer', {className:'parish-booking-dialog__footer'},
      /^https?:\/\//i.test(booking.certificate_file_url || '') ? h('a', {href:booking.certificate_file_url, target:'_blank', rel:'noopener noreferrer', className:'secondary-action'}, 'View certificate') : h('span', null, 'No certificate uploaded yet'),
      h('button', {type:'button', className:'primary-action', onClick:onClose}, 'Done')));
}
