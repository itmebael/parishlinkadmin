import { ADDRESS_OPTIONS } from './address-options.js';
export { ADDRESS_OPTIONS };
export function massAudience(location, eventType = 'Mass') {
 const value = String(location || 'Main Parish').trim();
 const match = value.match(/^BEC Area:\s*(.*)$/i);
 if (match) {
  const area = match[1].trim();
  if (!ADDRESS_OPTIONS.includes(area)) throw new Error('Choose a BEC area from the list before saving.');
  return { audience_type: 'bec_area', audience_area: area };
 }
 return { audience_type: value.toLowerCase() === 'main parish' ? 'main_parish' : 'other', audience_area: null };
}
