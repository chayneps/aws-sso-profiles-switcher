import {build} from 'esbuild';
import {mkdir, rm, copyFile, readFile, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await rm(`${root}dist`,{recursive:true,force:true}); await mkdir(`${root}dist/icons`,{recursive:true});
for(const [input,output] of [['src/background/worker.js','worker'],['src/content/portal.js','portal'],['src/content/console.js','console'],['src/ui/popup.js','popup'],['src/ui/options.js','options']]) {
  await build({entryPoints:[`${root}${input}`],outfile:`${root}dist/${output}.js`,bundle:true,format:output==='worker'?'esm':'iife',target:'chrome114',legalComments:'eof',minify:false});
}
for(const name of ['popup.html','options.html','styles.css','popup.css']) await copyFile(`${root}src/ui/${name}`,`${root}dist/${name}`);
await copyFile(`${root}manifest.json`,`${root}dist/manifest.json`);
// Package the reviewed thought-cloud artwork; never regenerate it during builds.
for(const size of [16,32,48,128]){
  const source=`${root}src/icons/${size}.png`, png=await readFile(source);
  if(png.toString('hex',0,8)!=='89504e470d0a1a0a'||png.readUInt32BE(16)!==size||png.readUInt32BE(20)!==size)throw new Error(`Invalid ${size}px PNG icon.`);
  await copyFile(source,`${root}dist/icons/${size}.png`);
}
const manifest=JSON.parse(await readFile(`${root}dist/manifest.json`,'utf8'));
if(manifest.manifest_version!==3||manifest.permissions.some(p=>['cookies','webRequest','debugger'].includes(p)))throw new Error('Unexpected manifest permissions.');
const assets=[manifest.background.service_worker,manifest.action.default_popup,manifest.options_ui.page,...Object.values(manifest.icons),...Object.values(manifest.action.default_icon),...manifest.content_scripts.flatMap(script=>script.js),'portal.js'];
for(const asset of assets) await access(`${root}dist/${asset}`);
for(const pageName of ['popup.html','options.html']){
  const html=await readFile(`${root}dist/${pageName}`,'utf8');
  for(const [,src,body] of html.matchAll(/<script[^>]*src="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g)){
    if(!/^[a-z-]+\.js$/.test(src)||body.trim())throw new Error('Extension pages must use packaged scripts.');
    await access(`${root}dist/${src}`);
  }
  if(html.includes('demo.js'))throw new Error('Demo transport must not be packaged.');
  for(const [,src] of html.matchAll(/<img[^>]*src="([^"]+)"/g))await access(`${root}dist/${src}`);
}
if(!manifest.content_security_policy.extension_pages.includes("script-src 'self'"))throw new Error('Missing packaged-script CSP.');
console.log('Built unpacked extension in dist/');
