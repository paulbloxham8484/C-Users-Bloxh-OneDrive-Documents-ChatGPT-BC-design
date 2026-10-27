'use strict';
function workspaceFile(rawUrl, allowedFiles) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'bcdesign:' || url.hostname !== 'app' || url.port || url.username || url.password) return null;
    const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).slice(1);
    return allowedFiles.has(name) ? name : null;
  } catch { return null; }
}
function externalLink(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
module.exports = { workspaceFile, externalLink };
