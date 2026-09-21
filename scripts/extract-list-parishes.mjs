import fs from "fs";
const s = fs.readFileSync("dist/assets/index-v20260422157000.js", "utf8");
const a = s.indexOf("rpc/list_parishes");
const b = s.indexOf('if(!nm.length)nm=["Parish of Catbalogan"]');
console.log("a", a, "b", b);
console.log(s.slice(a - 120, a + 520));
console.log("\n--- fallback ---\n");
console.log(s.slice(b - 200, b + 120));
