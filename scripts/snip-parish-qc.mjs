import fs from "node:fs";
const s = fs.readFileSync("dist/assets/index-v20260422157000.js", "utf8");
const i = s.indexOf('kind==="parish-search"){const l');
console.log("parish-search qc at", i);
console.log(s.slice(i, i + 400));
const j = s.indexOf('Parish of Catbalogan');
console.log("\nfirst Catbalogan context:", s.slice(j - 200, j + 200));
