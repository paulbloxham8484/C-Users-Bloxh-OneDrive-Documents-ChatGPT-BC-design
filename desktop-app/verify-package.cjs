'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const desktop=process.env.BC_DESIGN_PACKAGE_ROOT||__dirname,root=path.resolve(desktop,'..'),pkg=JSON.parse(fs.readFileSync(path.join(desktop,'package.json'),'utf8'));
const asarDir=fs.readdirSync(path.join(desktop,'node_modules/.pnpm')).filter(n=>n.startsWith('@electron+asar@'));assert.equal(asarDir.length,1,'Use the single lockfile-selected ASAR reader');const asar=require(path.join(desktop,'node_modules/.pnpm',asarDir[0],'node_modules/@electron/asar'));
const digest=b=>crypto.createHash('sha256').update(b).digest('hex'),hash=f=>digest(fs.readFileSync(f)),workspace=path.join(desktop,'workspace'),info=JSON.parse(fs.readFileSync(path.join(workspace,'build-info.json'),'utf8')),allow=JSON.parse(fs.readFileSync(path.join(root,'distribution/workspace-files.json'),'utf8')),release=path.resolve(desktop,pkg.build.directories.output);
assert.equal(info.version,pkg.version);for(const f of allow){assert.equal(hash(path.join(root,f)),info.hashes[f],f+' canonical drift');const expected=f==='index.html'?fs.readFileSync(path.join(root,f),'utf8').replace('</head>','<script src="desktop-flags.js"></script></head>'):fs.readFileSync(path.join(root,f));assert.equal(hash(path.join(workspace,f)),digest(expected),f+' generated workspace drift');}
const expectedWorkspace=[...allow,'allowed-files.json','desktop-flags.js','build-info.json'].sort();
const listFiles=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?listFiles(path.join(directory,entry.name)).map(file=>entry.name+'/'+file):[entry.name]);
assert.deepEqual(listFiles(workspace).sort(),expectedWorkspace,'No unapproved files in generated workspace');
const expectedFiles=['main.cjs','paths.cjs','package.json',...expectedWorkspace.map(f=>'workspace/'+f)].sort(),results=[];
for(const [arch,folder,machine]of [['arm64','win-arm64-unpacked',0xaa64],['x64','win-unpacked',0x8664]]){
 const exe=path.join(release,folder,'BC Design.exe'),archive=path.join(release,folder,'resources/app.asar'),pe=fs.readFileSync(exe);
 assert.equal(pe.readUInt16LE(pe.readUInt32LE(0x3c)+4),machine,arch+' PE machine');
 // ASAR traverses using the host separator, including nested image directories.
 const files=asar.listPackage(archive).map(f=>f.replace(/^[\\/]/,'')).filter(f=>!asar.statFile(archive,f).files).map(f=>f.replaceAll('\\','/')).sort();
 const extract=f=>asar.extractFile(archive,path.normalize(f));
 assert.deepEqual(files,expectedFiles,arch+' source-only archive');
 assert.deepEqual(JSON.parse(extract('workspace/build-info.json').toString()),info);
 for(const f of files)if(f!=='package.json')assert.equal(digest(extract(f)),hash(path.join(desktop,f)),arch+' '+f);
 assert.equal(JSON.parse(extract('package.json').toString()).version,pkg.version);
 results.push({arch,exe,archive,archiveSha256:hash(archive),files:files.length,canonicalFiles:allow.length,passed:true});
}
const installer=path.join(release,`BC-Design-Setup-${pkg.version}.exe`),out={checked:new Date().toISOString(),version:pkg.version,distribution:info.distribution,source:info.source,schema:info.schema,installer:{path:installer,bytes:fs.statSync(installer).size,sha256:hash(installer),architectures:['arm64','x64']},packages:results};fs.mkdirSync(path.join(root,'test-results'),{recursive:true});fs.writeFileSync(path.join(root,'test-results/desktop63-package-integrity.json'),JSON.stringify(out,null,2));console.log(JSON.stringify({version:pkg.version,source:info.source,schema:info.schema,installerBytes:out.installer.bytes,packages:results.map(r=>({arch:r.arch,files:r.files,passed:r.passed}))}));
