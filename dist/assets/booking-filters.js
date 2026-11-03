import { isCertificateRequest } from './pending-queue.js?v=20261031-clickable';
export function bookingStatusGroup(row) {
  const status=String(row.booking_status||'Pending').trim().toLowerCase();
  if (/^(declined|rejected|disapproved|cancelled|canceled)$/.test(status)) return 'declined';
  if (/^(confirmed|approved)$/.test(status)) return 'approved';
  if (/^(completed|complete|released|done|certificate ready|collected)$/.test(status)) return 'completed';
  return 'pending';
}
export function filterBookings(rows, search='', type='all', status='all') {
  const query=search.trim().toLowerCase();
  return rows.filter(row=>(type==='all'||isCertificateRequest(row)===(type==='certificates'))
    &&(status==='all'||bookingStatusGroup(row)===status)
    &&(!query||['client_name','reference_number','service_name','booking_status','father_name','booking_date'].some(key=>String(row[key]||'').toLowerCase().includes(query))));
}
export function BookingFilters({React:R, rows, type, status, onType, onStatus, onSelect}) {
  const h=R.createElement;
  const stats=[['Total',rows.length],['Certificates',rows.filter(isCertificateRequest).length],['Appointments',rows.filter(row=>!isCertificateRequest(row)).length],...['pending','approved','declined','completed'].map(group=>[group.charAt(0).toUpperCase()+group.slice(1),rows.filter(row=>bookingStatusGroup(row)===group).length])];
  const select=(label,value,onChange,options)=>h('label',null,h('span',null,label),h('select',{value,onChange:event=>onChange(event.target.value)},options.map(([id,text])=>h('option',{key:id,value:id},text))));
  return h('div',{className:'parish-booking-tools'},
    h('div',{className:'parish-booking-stats'},stats.map(([label,count])=>{
      const nextType=label==='Certificates'?'certificates':label==='Appointments'?'appointments':'all';
      const nextStatus=['Pending','Approved','Declined','Completed'].includes(label)?label.toLowerCase():'all';
      return h('button',{key:label,type:'button','aria-label':label+': '+count+' requests','aria-pressed':type===nextType&&status===nextStatus,onClick:()=>onSelect(nextType,nextStatus)},h('span',null,label),h('strong',null,String(count)));
    })),
    h('div',{className:'parish-booking-filters'},
      select('Request type',type,onType,[['all','All request types'],['certificates','Certificate bookings'],['appointments','Event / Mass appointments']]),
      select('Status',status,onStatus,[['all','All statuses'],['pending','Pending'],['approved','Approved'],['declined','Declined / Cancelled'],['completed','Completed / Certificate Ready']])));
}
