import fs from 'node:fs';

const file = 'dist/assets/index-v20260422157000.js';
const source = fs.readFileSync(file, 'utf8');
const oldText = 'O=E||k?lh:Qi';
const newText = 'O=E?"/dist/assets/logo.png":k?lh:Qi';
const matches = source.split(oldText).length - 1;

if (matches === 0 && source.includes(newText)) {
  console.log('Dashboard logo is already applied.');
} else if (matches === 1) {
  fs.writeFileSync(file, source.replace(oldText, newText));
  console.log('Dashboard logo applied.');
} else {
  throw new Error(`Expected one dashboard logo assignment, found ${matches}.`);
}
