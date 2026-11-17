import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {createFavicon,profileFavicon,FAVICON_ID} from '../src/core/favicon.js';
const svg=href=>decodeURIComponent(href.slice(href.indexOf(',')+1));
test('tab icon is one colored thought cloud without lettering or dots and rejects injected markup',()=>{
  assert.match(svg(profileFavicon('#FA4D56')),/path.*fill="#fa4d56"/);assert.doesNotMatch(svg(profileFavicon('#123456')),/<circle|<text|<image|<script|href=|111122223333/);
  assert.equal((svg(profileFavicon('#123456')).match(/<path\b/g)||[]).length,1);
  const dom=new JSDOM('<link rel="icon" href="/favicon.ico">'),doc=dom.window.document,adapter=createFavicon(doc),before=doc.head.innerHTML;
  for(const bad of ['red','#123','"><script>alert(1)</script>',null])assert.throws(()=>adapter.apply(bad),/Invalid favicon color/);
  assert.equal(doc.head.innerHTML,before);dom.window.close();
});
test('multiple native icons restore exactly; profile changes reuse one replacement without touching touch icons',()=>{
  const dom=new JSDOM('<head><link rel="shortcut icon" href="/original.ico" type="image/x-icon"><meta name="test" content="kept"><link rel="ICON" href="/large.png" sizes="64x64" media="(prefers-color-scheme:dark)"><link rel="apple-touch-icon" href="/touch.png"></head>');
  const doc=dom.window.document,adapter=createFavicon(doc),before=doc.head.innerHTML,original=doc.querySelector('link');
  assert.equal(adapter.isCurrent(),false);assert.equal(adapter.apply('#4589ff'),true);const replacement=doc.getElementById(FAVICON_ID);
  assert.equal(doc.querySelectorAll('link[rel~="icon" i]').length,1);assert.equal(doc.querySelector('[rel="apple-touch-icon"]').getAttribute('href'),'/touch.png');assert.equal(adapter.isCurrent(),true);
  adapter.apply('#f1c21b');assert.equal(doc.getElementById(FAVICON_ID),replacement);assert.match(svg(replacement.href),/#f1c21b/);adapter.clear();
  assert.equal(doc.head.innerHTML,before);assert.equal(doc.querySelector('link'),original);adapter.clear();assert.equal(doc.head.innerHTML,before);dom.window.close();
});
test('native icon resets, added icons and head replacement invalidate the adapter and can be reapplied',()=>{
  const dom=new JSDOM('<link rel="icon" href="/old.ico">'),doc=dom.window.document,adapter=createFavicon(doc);
  adapter.apply('#24a148');doc.getElementById(FAVICON_ID).href='/reset.ico';assert.equal(adapter.isCurrent(),false);adapter.apply('#24a148');assert.equal(adapter.isCurrent(),true);
  doc.getElementById(FAVICON_ID).setAttribute('media','not all');assert.equal(adapter.isCurrent(),false);adapter.apply('#24a148');assert.equal(doc.getElementById(FAVICON_ID).hasAttribute('media'),false);
  const added=doc.createElement('link');added.rel='icon';added.href='/new.ico';doc.head.append(added);assert.equal(adapter.isCurrent(),false);adapter.apply('#24a148');assert.equal(doc.querySelectorAll('link[rel~="icon" i]').length,1);
  const head=doc.createElement('head');head.innerHTML='<link rel="icon" href="/current-service.ico">';doc.head.replaceWith(head);assert.equal(adapter.isCurrent(),false);adapter.apply('#24a148');assert.equal(adapter.isCurrent(),true);
  adapter.clear();assert.equal(doc.querySelectorAll('link[rel~="icon" i]').length,1);assert.equal(doc.querySelector('link').getAttribute('href'),'/current-service.ico');dom.window.close();
});
test('console content script updates the icon, repairs resets, avoids mutation loops, and restores on identity loss',async()=>{
  const bundle=(await build({entryPoints:[new URL('../src/content/console.js',import.meta.url).pathname],bundle:true,format:'iife',write:false,target:'chrome114'})).outputFiles[0].text;
  const dom=new JSDOM('<link rel="icon" href="/native.ico"><body><header id="awsc-nav-header"><button id="nav-usernameMenu" title="AWSReservedSSO_Developer_0123456789abcdef/user">111122223333</button></header></body>',{url:'https://111122223333-abc.us-east-1.console.aws.amazon.com/console/home',runScripts:'outside-only'});
  const {window}=dom,doc=window.document,native=doc.querySelector('link');let profile={accountId:'111122223333',permissionSet:'Developer',theme:'system',color:'#fa4d56'},requests=0,recheck,changed;
  window.matchMedia=()=>({matches:false,addEventListener(){}});const schedule=window.setTimeout.bind(window);window.setTimeout=fn=>schedule(fn,0);
  window.chrome={runtime:{sendMessage:async()=>{requests++;return{ok:true,profile};},onMessage:{addListener:fn=>{recheck=fn;}}},storage:{onChanged:{addListener:fn=>{changed=fn;}}}};
  const until=async condition=>{for(let i=0;i<100&&!condition();i++)await new Promise(r=>setTimeout(r,2));assert.ok(condition(),'Expected content-script update');};
  try{
    window.eval(bundle);await until(()=>!!doc.getElementById(FAVICON_ID));assert.match(svg(doc.getElementById(FAVICON_ID).href),/#fa4d56/);
    const initial=requests;await new Promise(r=>setTimeout(r,10));assert.equal(requests,initial);
    profile={...profile,color:'#4589ff'};changed({config:{}},'local');await until(()=>svg(doc.getElementById(FAVICON_ID).href).includes('#4589ff'));
    doc.getElementById(FAVICON_ID).href='/aws-reset.ico';await until(()=>svg(doc.getElementById(FAVICON_ID).href).includes('#4589ff'));
    doc.getElementById(FAVICON_ID).remove();await until(()=>!!doc.getElementById(FAVICON_ID));
    profile=null;recheck({type:'RECHECK_CONSOLE'});await until(()=>!doc.getElementById(FAVICON_ID));assert.equal(doc.querySelector('link'),native);assert.equal(native.getAttribute('href'),'/native.ico');
  }finally{dom.window.close();}
});
