import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Use Node's bundled parser to edit the deployed bundle without rebuilding it.
const parser = { exports: {} };
parser.module = { exports: parser.exports };
vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'], parser);
const parse = source => parser.exports.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const file = 'dist/assets/index-v20260422157000.js';
let source = fs.readFileSync(file, 'utf8');
const before = source.length;
const removed = [];
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
function edit(edits) {
  for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0])) {
    source = source.slice(0, start) + value + source.slice(end);
  }
  parse(source);
}
function replace(before, after) {
  assert.equal(source.split(before).length, 2, `Expected unique match: ${before.slice(0, 70)}`);
  source = source.replace(before, after);
}
const dioceseRoutes = new Set(['dashboard','analytics','calendar','services','parishes','records','archive','clergy','reports','announcements','messages','settings']);
let ast = parse(source);
const router = ast.body.find(node => node.id?.name === 'Ng');
const edits = [];
walk(router, node => {
  if (node.type !== 'SwitchCase') return;
  if (dioceseRoutes.has(node.test?.value)) edits.push([node.start, node.end, '']);
  else if (node.test === null) edits.push([node.start, node.end, 'default:return null;']);
});
walk(ast, node => {
  if (node.type === 'VariableDeclarator' && node.id.name === 'Dc') {
    const kept = node.init.properties.filter(property => !dioceseRoutes.has(property.key.name || property.key.value));
    edits.push([node.init.start, node.init.end, '{' + kept.map(p => source.slice(p.start, p.end)).join(',') + '}']);
  }
});
edit(edits);
replace('Dc[e]||Dc.dashboard', 'Dc[e]||Dc["user-dashboard"]');
replace('x=fg(u)', 'x=null');
replace('function pg(e,t){return e?{profile:"parish-catbalogan",editProfile:"parish-settings"}:t?{profile:"user-dashboard",editProfile:"user-profile-settings"}:{profile:"dashboard",editProfile:"settings"}}', 'function pg(e,t){return e?{profile:"parish-catbalogan",editProfile:"parish-settings"}:{profile:"user-dashboard",editProfile:"user-profile-settings"}}');
replace('onClick:()=>e("dashboard"),children:"Cancel"', 'onClick:()=>e(Rc(Fc()?.role)),children:"Cancel"');

// Collapse the third (Diocese) workspace branch in the shared application shell.
ast = parse(source);
const shell = ast.body.find(node => node.id?.name === 'gg');
const shellEdits = [];
walk(shell, node => {
  if (node.type === 'VariableDeclarator' && ['U','ee','T','g'].includes(node.id.name)) {
    const conditional = node.init;
    assert.equal(conditional.alternate.type, 'ConditionalExpression');
    shellEdits.push([conditional.alternate.start, conditional.alternate.end, source.slice(conditional.alternate.consequent.start, conditional.alternate.consequent.end)]);
  }
});
edit(shellEdits);
replace('return t==="login"?n.jsxs("div",{className:"scene scene--login"', 'return t==="login"||(!E&&!k&&t!=="logout")?n.jsxs("div",{className:"scene scene--login"');
replace('workspaceType:k?"user":E?"parish":"diocese"', 'workspaceType:k?"user":"parish"');
replace('workspaceType:t="diocese"', 'workspaceType:t="parish"');
source = source.replaceAll('workspaceLabel:e="Diocese"', 'workspaceLabel:e="Parish"').replaceAll('workspaceLabel:t="Diocese"', 'workspaceLabel:t="Parish"');

// Remove Diocese notification queries while retaining both remaining inboxes.
source = source.replace(/else if\(role==="diocese"\)\{\s*[bm]q="[^"]*";\s*\}/g, '');
replace('(t?"user":e?"parish":"diocese")', '(t?"user":e?"parish":"")');
const notificationStart = source.indexOf('  if(e||t)return uN;');
const notificationEnd = source.indexOf('\n}', notificationStart);
assert.ok(notificationStart > 0 && notificationEnd > notificationStart);
source = source.slice(0, notificationStart) + '  return uN;' + source.slice(notificationEnd);

// Only delete functions after confirming no remaining code references them.
const candidates = new Set(['wg','bg','Sg','Dg','Hg','Kg','Qg','Yg','Gg','Zg','rn','fg','po','ia','hg','Xa']);
let progress = true;
while (progress) {
  progress = false;
  ast = parse(source);
  for (const fn of ast.body.filter(node => node.type === 'FunctionDeclaration' && candidates.has(node.id.name))) {
    let referenced = false;
    walk(ast, node => {
      if (node.start >= fn.start && node.end <= fn.end) return;
      if (node.type === 'Identifier' && node.name === fn.id.name) referenced = true;
    });
    if (!referenced) {
      source = source.slice(0, fn.start) + source.slice(fn.end);
      removed.push(fn.id.name);
      progress = true;
      break;
    }
  }
}
for (const name of ['wg','bg','Sg','Dg','Hg','Kg','Qg','Yg','Gg','Zg','fg']) {
  assert.ok(!parse(source).body.some(node => node.id?.name === name), `Still referenced: ${name}`);
}
fs.writeFileSync(file, source);
console.log(`Removed ${removed.length} Diocese functions and ${before - source.length} characters of dashboard code.`);
