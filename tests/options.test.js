import {moveAccount} from '../src/core/account-order.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {emptyConfig,sanitizeProfile} from '../src/core/model.js';
const html=await readFile(new URL('../src/ui/options.html',import.meta.url),'utf8');
const bundle=(await build({entryPoints:[new URL('../src/ui/options.js',import.meta.url).pathname],bundle:true,format:'iife',write:false,target:'chrome114'})).outputFiles[0].text;
const portal='https://example.awsapps.com/start/';
const profile=sanitizeProfile({portalId:portal,accountId:'111122223333',accountName:'Development Integration with a Full Account Name',permissionSet:'Developer'});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function options(t,{launchResult={focused:false},catalog=[profile]}={}) {
  const dom=new JSDOM(html,{url:'chrome-extension://test-extension/options.html',runScripts:'outside-only',pretendToBeVisual:true});
  const {window}=dom,doc=window.document,calls=[];
  const config={...emptyConfig(),portals:[{id:portal,baseUrl:portal,label:'Work'}],profiles:structuredClone(catalog)};
  window.HTMLElement.prototype.scrollIntoView=()=>{};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.setInterval=()=>1;window.clearInterval=()=>{};
  const state=()=>({config:structuredClone(config),sessions:{items:[],limit:5,complete:true},observed:[],draft:null,portalAccess:{[portal]:'ready'},multiSession:{status:'enabled'}});
  window.chrome={runtime:{id:'test-extension',sendMessage:async m=>{
    calls.push(m);
    if(['UI_OPENED','GET_STATE'].includes(m.type))return{ok:true,...state()};
    if(m.type==='REORDER_ACCOUNT'){try{Object.assign(config,moveAccount(config,m));return{ok:true};}catch(e){return{ok:false,error:e.message};}}
    if(m.type==='SET_VISIBILITY'){config.profiles[0].showInPopup=m.show;return{ok:true};}
    if(m.type==='SET_CUSTOM_COLOR'){config.ui.customColors[m.index]=m.color;return{ok:true};}
    if(m.type==='SAVE_PROFILE'){config.profiles[0]=m.profile;return{ok:true};}
    if(m.type==='SET_COLOR'){config.profiles[0].color=m.color;return{ok:true};}
    if(m.type==='LAUNCH')return{ok:true,...launchResult};
    return{ok:false,error:'Unexpected test action'};
  }},storage:{onChanged:{addListener:()=>{}}},permissions:{request:async()=>true}};
  window.eval(bundle);await flush();
  t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));dom.window.close();});
  return{doc,window,calls,config};
}
test('config cards retain visibility and Edit/Color while removing all pin controls',async t=>{
  const {doc,window,calls,config}=await options(t);
  let card=doc.querySelector('.profile-card');
  const check=card.querySelector('.card-controls input[type=checkbox]');
  assert.equal(check.checked,true);assert.match(check.title,/Show in popup/);assert.equal(card.querySelector('.pin-button'),null);assert.equal(doc.querySelector('#edit-favorite'),null);
  assert.equal(check.closest('.card-controls').children.length,1);assert.equal(check.parentElement.textContent,'');
  const prefs=card.querySelector('.card-preferences');assert.ok(prefs.querySelector('button'));assert.ok(prefs.querySelector('.palette-trigger'));assert.equal(card.querySelector('.card-actions'),null);
  assert.equal(card.querySelector('button[aria-label^="Open "]'),null);
  assert.equal(doc.querySelector('.account-group-name').textContent,profile.accountName);assert.equal(doc.querySelector('.account-group-id').textContent,profile.accountId);
  check.checked=false;check.dispatchEvent(new window.Event('change',{bubbles:true}));await flush();
  assert.equal(config.profiles[0].showInPopup,false);assert.equal(calls.filter(m=>m.type==='LAUNCH').length,0);
});
test('double-click opens the tile; nested controls never trigger profile launch',async t=>{
  const {doc,window,calls}=await options(t);
  const card=doc.querySelector('.profile-card'),title=card.querySelector('h3');
  title.click();await flush();assert.equal(calls.filter(m=>m.type==='LAUNCH').length,0);
  for(const control of card.querySelectorAll('input,button,label'))control.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true}));
  await flush();assert.equal(calls.filter(m=>m.type==='LAUNCH').length,0);
  title.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true}));await flush();
  assert.equal(calls.filter(m=>m.type==='LAUNCH').length,1);assert.equal(calls.find(m=>m.type==='LAUNCH').id,profile.id);
  card.querySelector('.card-preferences button').click();await flush();assert.equal(doc.querySelector('#profile-dialog').open,true);
});
test('keyboard opening works from tile only and preserves capacity alerts',async t=>{
  const {doc,window,calls}=await options(t,{launchResult:{sessionFull:true}});
  const card=doc.querySelector('.profile-card');assert.equal(card.tabIndex,0);
  card.querySelector('input').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await flush();assert.equal(calls.filter(m=>m.type==='LAUNCH').length,0);
  card.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await flush();assert.equal(calls.filter(m=>m.type==='LAUNCH').length,1);
  assert.match(doc.querySelector('#status').textContent,/All 5 session slots/);assert.equal(doc.querySelector('#status').classList.contains('error'),true);
});
test('card palette offers four named presets and four editable custom slots',async t=>{
  const {doc,calls,config}=await options(t);
  doc.querySelector('.profile-card .palette-trigger').click();
  const palette=doc.querySelector('.color-palette-dialog');assert.equal(palette.open,true);
  const presets=[...palette.querySelectorAll('[aria-label="Preset colors"] button')];
  assert.deepEqual(presets.map(n=>n.textContent.replace('✓','')),[ 'Red','Yellow','Green','Blue' ]);
  assert.equal(palette.querySelectorAll('.palette-custom').length,4);assert.equal(palette.querySelectorAll('input[type=color]').length,4);
  presets[0].click();await flush();assert.equal(config.profiles[0].color,'#fa4d56');assert.equal(palette.open,false);
  assert.equal(calls.filter(m=>m.type==='LAUNCH').length,0);
  doc.querySelector('.profile-card .palette-trigger').click();assert.equal(palette.querySelector('[aria-label="Preset colors"] button').getAttribute('aria-pressed'),'true');
  assert.equal(palette.querySelector('[aria-label="Preset colors"] button .palette-check').hidden,false);
});
test('custom picker saves a reusable slot and applies it without changing unrelated preferences',async t=>{
  const {doc,window,calls,config}=await options(t);
  doc.querySelector('.profile-card .palette-trigger').click();const palette=doc.querySelector('.color-palette-dialog');
  const picker=palette.querySelector('input[type=color]');picker.value='#123456';picker.dispatchEvent(new window.Event('change',{bubbles:true}));await flush();await flush();
  assert.equal(config.ui.customColors[0],'#123456');assert.equal(config.profiles[0].color,'#123456');assert.equal(config.profiles[0].theme,profile.theme);assert.equal(palette.open,false);
  doc.querySelector('.profile-card .palette-trigger').click();const custom=palette.querySelector('.palette-custom button');
  assert.equal(custom.getAttribute('aria-pressed'),'true');assert.match(custom.getAttribute('aria-label'),/Use custom 1 #123456/);
  palette.querySelector('[aria-label="Preset colors"] button').click();await flush();
  doc.querySelector('.profile-card .palette-trigger').click();palette.querySelector('.palette-custom button').click();await flush();
  assert.equal(config.profiles[0].color,'#123456');assert.equal(calls.filter(m=>m.type==='SET_CUSTOM_COLOR').length,1);assert.equal(calls.filter(m=>m.type==='LAUNCH').length,0);
});
test('editor palette changes draft color only until the profile form is saved',async t=>{
  const {doc,window,config}=await options(t);
  doc.querySelector('.card-preferences .text-button').click();const editor=doc.querySelector('#profile-dialog');
  editor.querySelector('.palette-trigger').click();const palette=doc.querySelector('.color-palette-dialog');
  palette.querySelectorAll('[aria-label="Preset colors"] button')[3].click();await flush();
  assert.equal(doc.querySelector('#edit-color').value,'#4589ff');assert.equal(config.profiles[0].color,profile.color);assert.equal(editor.open,true);
  doc.querySelector('#profile-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await flush();
  assert.equal(config.profiles[0].color,'#4589ff');assert.equal(editor.open,false);
});
test('config headers reorder accounts without opening profiles or changing controls',async t=>{
  const other=sanitizeProfile({...profile,accountName:'Production',accountId:'444455556666'});
  const {doc,window,calls,config}=await options(t,{catalog:[profile,other]});
  doc.querySelector('.account-group-legend').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true,cancelable:true}));await flush();await flush();
  assert.equal(doc.querySelector('.account-group-id').textContent,other.accountId);assert.equal(config.ui.accountOrder.length,2);assert.equal(calls.filter(m=>m.type==='LAUNCH').length,0);
  assert.equal(doc.querySelectorAll('.card-controls input[type=checkbox]').length,2);
  window.dispatchEvent(new window.Event('focus'));await flush();assert.equal(doc.activeElement,doc.querySelectorAll('#profile-grid legend')[1]);
});
