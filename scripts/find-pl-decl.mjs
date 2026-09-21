import fs from "node:fs";
const s = fs.readFileSync("dist/assets/index-v20260422157000.js", "utf8");
const patterns = ["[pl,Hl]", "parishOptions:pl", "const[pl,", ",pl,"];
for (const p of patterns) {
  let i = 0,
    c = 0;
  while ((i = s.indexOf(p, i + 1)) !== -1 && c < 3) {
    console.log(p, i);
    c++;
  }
}
