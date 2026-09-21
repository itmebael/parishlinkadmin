import fs from "node:fs";
const s = fs.readFileSync("dist/assets/index-v20260422157000.js", "utf8");
const gg = s.indexOf("function gg(");
const vg = s.indexOf("function vg(");
const fgEnd = s.indexOf("}function Uc(");
console.log({ gg, vg, fgEnd, vgAfterGg: vg > gg });

// Rough: find first "return t===" after gg start (gg's big return)
const ret = s.indexOf('return t==="login"', gg);
console.log("gg return login idx", ret);
console.log("vg before gg return?", vg < ret);
