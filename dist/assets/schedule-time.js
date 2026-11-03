export function scheduleMinutes(value) {
 const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(AM|PM)?$/i);
 if(!match)return Infinity;
 let hour=Number(match[1]);const minute=Number(match[2]);
 if(minute>59||hour>(match[3]?12:23)||(match[3]&&hour<1))return Infinity;
 if(match[3])hour=hour%12+(match[3].toUpperCase()==='PM'?12:0);
 return hour*60+minute;
}
export function scheduleTime(value) {
 const minutes=scheduleMinutes(value);
 if(!Number.isFinite(minutes))return '';
 const hour=Math.floor(minutes/60);
 return (hour%12||12)+':'+String(minutes%60).padStart(2,'0')+' '+(hour<12?'AM':'PM');
}
export function compareScheduleTimes(a,b) {
 const first=scheduleMinutes(a.startTime),second=scheduleMinutes(b.startTime);
 return first===second?String(a.title||'').localeCompare(String(b.title||'')):first<second?-1:1;
}
