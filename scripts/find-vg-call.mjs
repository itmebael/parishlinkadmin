import fs from "node:fs";
const s = fs.readFileSync("dist/assets/index-v20260422157000.js", "utf8");
const i = s.indexOf("n.jsx(vg,");
console.log("idx", i);
console.log(s.slice(i, i + 400));
