import fs from "node:fs";
const s = fs.readFileSync("dist/assets/index-v20260422157000.js", "utf8");
const i = s.indexOf('className:"registration-parish-select"');
console.log(s.slice(i - 120, i + 200));
