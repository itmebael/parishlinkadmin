import fs from "node:fs";
const s = fs.readFileSync("dist/assets/index-v20260422157000.js", "utf8");
const i = s.indexOf('lf="');
const j = s.indexOf('"', i + 4);
console.log("URL:", s.slice(i + 4, j));
const yi = s.indexOf(',Yi="');
const yj = s.indexOf('"', yi + 5);
console.log("Key prefix:", s.slice(yi + 5, yi + 5 + 25) + "...");
console.log("Y=!!Yi present:", s.includes("Y=!!Yi"));
