/**
 * Re-apply after replacing dist/assets/index-v*.js from upstream:
 * adds a native React "Decline" control next to "Copy" on parish booking rows.
 */
import fs from "fs";
const p = new URL("../dist/assets/index-v20260422157000.js", import.meta.url);
let s = fs.readFileSync(p, "utf8");

const old =
  'children:A?"Copied":"Copy"})]})]},y.id||j)}';

const neu =
  'children:A?"Copied":"Copy"}),n.jsx("button",{type:"button",className:"secondary-action parish-booking-decline",disabled:p||/cancel|cancell|cancelled|canceled|declined|confirmed|confirm|complete|released|done/i.test(String(y.booking_status||"")),onClick:async()=>{if(!window.confirm("Decline this booking? The requester will see it as Declined."))return;if(!Y){l({tone:"error",title:"Database not configured",message:"Connect the database before updating the booking."});return}try{f(y.id);await vh("diocese_service_bookings",`id=eq.${encodeURIComponent(y.id)}`,{booking_status:"Declined"},be(e),"id");try{y.booking_status="Declined"}catch(__){}l({tone:"success",title:"Booking declined",message:"The booking has been marked as Declined."});await d()}catch(_e){l({tone:"error",title:"Could not decline booking",message:V(_e)})}finally{f("")}},children:p?"Declining...":"Decline"})]})]},y.id||j)}';

const n = s.split(old).length - 1;
if (n !== 1) {
  console.error("Expected 1 occurrence, got", n);
  process.exit(1);
}
s = s.replace(old, neu);
fs.writeFileSync(p, s);
console.log("patched", p.pathname);
