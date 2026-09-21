import fs from "node:fs";
const s = fs.readFileSync("dist/assets/index-v20260422157000.js", "utf8");
const l = s.indexOf('lf="https');
const g = s.indexOf("function gg(");
console.log({ lf: l, gg: g, lfBeforeGg: l < g });
