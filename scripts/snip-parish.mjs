import fs from "fs";
const s = fs.readFileSync("dist/assets/index-v20260422157000.js", "utf8");
for (const needle of ["df.includes", "df.some", "allowedParish", "parishOptions", "parish_name.asc", "list_parishes"]) {
  let i = 0;
  let n = 0;
  while ((i = s.indexOf(needle, i)) !== -1 && n++ < 3) {
    console.log("\n===", needle, i, "===");
    console.log(s.slice(i - 100, i + 280));
    i++;
  }
}
