import fs from 'node:fs';

const file = 'dist/assets/index-v20260422157000.js';
const source = fs.readFileSync(file, 'utf8');
const title = 'n.jsx("h4",{children:j.recordType==="Baptism"?"Baptism Records":"Archive Records"})';
const article = 'n.jsxs("article",{className:"glass-card page-card screen-grid__full"';
const titleIndex = source.indexOf(title);

if (source.includes(`j.recordType==="Baptism"?null:${article}`)) {
  console.log('Archive Baptism results card is already hidden.');
} else if (titleIndex < 0) {
  throw new Error('Could not find the archive results title.');
} else {
  const articleIndex = source.lastIndexOf(article, titleIndex);
  if (articleIndex < 0) throw new Error('Could not find the archive results card.');
  const replacement = `j.recordType==="Baptism"?null:${article}`;
  fs.writeFileSync(file, source.slice(0, articleIndex) + replacement + source.slice(articleIndex + article.length));
  console.log('Archive Baptism results card hidden.');
}
