import fs from "node:fs";
const s = fs.readFileSync("dist/assets/index-v20260422157000.js", "utf8");
const start = s.indexOf("N.useEffect(()=>{if(!Y){Hl(");
console.log(s.slice(start, start + 900));
