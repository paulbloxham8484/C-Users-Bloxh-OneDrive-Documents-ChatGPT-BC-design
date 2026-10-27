const assert = require('node:assert/strict');
const { workspaceFile, externalLink } = require('./paths.cjs');
const allowed = new Set(['index.html', 'app.js']);
assert.equal(workspaceFile('bcdesign://app/', allowed), 'index.html');
assert.equal(workspaceFile('bcdesign://app/app.js?v=45', allowed), 'app.js');
for (const url of ['file:///C:/secret', 'bcdesign://other/app.js', 'bcdesign://app/%2e%2e%5csecret', 'bcdesign://app/%2fapp.js', 'bcdesign://user@app/app.js', 'bcdesign://app/app.js%00', 'bcdesign://app/%zz', 'https://app/app.js']) assert.equal(workspaceFile(url, allowed), null, url);
assert.equal(externalLink('https://www.stratco.com.au/'), 'https://www.stratco.com.au/');
for (const url of ['file:///C:/', 'javascript:alert(1)', 'ms-settings:', 'https://user:password@example.com/', 'bad']) assert.equal(externalLink(url), null);
console.log('Desktop asset boundary and external-link protocol checks passed.');
