import fs from 'node:fs';
import path from 'node:path';

// dist contains the maintained application, not disposable Vite output.
const target = path.resolve('site-build');
// A new module filename prevents previously cached app code from rendering old screens.
fs.copyFileSync('dist/assets/index-v20260422157000.js', 'dist/assets/admin-services-20261008-2.js');
fs.copyFileSync('dist/assets/index-v20260422157000.js', 'dist/assets/admin-services-20261009-3.js');
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync('index.html', path.join(target, 'index.html'));
fs.cpSync('dist', path.join(target, 'dist'), { recursive: true });
fs.cpSync('public', target, { recursive: true });
for (const asset of ['logo.png', 'logologin.png', 'logocalbayog.png', 'HEADER.png', 'church.jpg']) {
  // Missing artwork must fail the build instead of shipping broken image URLs.
  fs.copyFileSync(asset, path.join(target, asset));
}
fs.copyFileSync('Virgen Maria dela Anunciacion.png', path.join(target, 'dist/assets/virgen-maria-anunciacion.png'));
console.log('Site built in site-build/. The maintained dashboard in dist/ is preserved.');
