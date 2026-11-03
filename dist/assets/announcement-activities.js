export function parseAnnouncementActivities(post){
 const lines=String(post.content||'').replace(/\r\n?/g,'\n').split('\n').filter(line=>line.trim());
 if(lines.length&&lines.every(line=>/^\d{4}-\d{2}-\d{2}\t/.test(line))){return lines.map(line=>{const [date,activity,barangay='',organization='',time='']=line.split('\t');return {date,activity,barangay,organization,...time?{time}:{}};});}
 return [{date:String(post.published_at||post.created_at||'').slice(0,10),activity:[post.title,post.content].filter(Boolean).join(' - '),barangay:'',organization:''}];
}
export function serializeAnnouncementActivities(activities){
 return activities.map(item=>[item.date,item.activity,item.barangay||'',item.organization||'',...item.time?[item.time]:[]].join('\t')).join('\n');
}
