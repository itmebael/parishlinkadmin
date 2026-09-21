import fs from "node:fs";
const s = fs.readFileSync("dist/assets/index-v20260422157000.js", "utf8");
let i = 0;
while ((i = s.indexOf("parishOptions:", i + 1)) !== -1) {
  console.log(s.slice(i - 80, i + 60));
}
