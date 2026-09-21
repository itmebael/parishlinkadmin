import fs from 'node:fs';
import path from 'node:path';

// dist contains the maintained application, not disposable Vite output.
const target = path.resolve('site-build');
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync('index.html', path.join(target, 'index.html'));
fs.cpSync('dist', path.join(target, 'dist'), { recursive: true });
fs.cpSync('public', target, { recursive: true });
console.log('Site built in site-build/. The maintained dashboard in dist/ is preserved.');
