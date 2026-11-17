import {moveAccount} from '../src/core/account-order.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {emptyConfig, sanitizeProfile} from '../src/core/model.js';

const html = await readFile(new URL('../src/ui/popup.html', import.meta.url), 'utf8');
const bundle = (await build({entryPoints:[new URL('../src/ui/popup.js', import.meta.url).pathname],bundle:true,format:'iife',write:false,target:'chrome114'})).outputFiles[0].text;
const portal = 'https://example.awsapps.com/start/';
const secondPortal = 'https://other.awsapps.com/start/';
const profiles = [['Development','111122223333','Developer'],['Production','444455556666','ReadOnly']].map(([accountName,accountId,permissionSet])=>sanitizeProfile({portalId:portal,accountName,accountId,permissionSet}));
const flush = () => new Promise(resolve => setImmediate(resolve));

async function popup(t, {mode='enabled', portalStatus='synced', multiple=false, setup=false, access, sessions={items:[],limit:5,complete:true}, catalog=profiles, closeResult={confirmed:true}, closeError}={}) {
  const dom = new JSDOM(html,{url:'chrome-extension://test-extension/popup.html',runScripts:'outside-only',pretendToBeVisual:true});
  const {window} = dom, doc = window.document, calls=[], intervals=new Map();
  let id=0, currentMode=mode, optionsOpened=0, permissionRequests=0, permissions=true, closed=false, failCheck=false;
  const config = {...emptyConfig(),portals:setup?[]:[{id:portal,baseUrl:portal,label:'Work',syncStatus:portalStatus}],profiles:setup?[]:structuredClone(catalog)};
  if(multiple)config.portals.push({id:secondPortal,baseUrl:secondPortal,label:'Other',syncStatus:'synced'});
  window.HTMLElement.prototype.scrollIntoView=()=>{};
  window.setInterval=(callback,ms)=>{intervals.set(++id,{callback,ms});return id;};
  window.clearInterval=key=>intervals.delete(key);
  window.close=()=>{closed=true;};
  const state=()=>({config:structuredClone(config),observed:[],sessions:structuredClone(sessions),draft:null,portalAccess:Object.fromEntries(config.portals.map(p=>[p.id,access??(p.syncStatus==='sign-in-required'?'sign-in-required':'unknown')])),multiSession:{status:currentMode},setupRequired:!config.portals.length});
  window.chrome={runtime:{id:'test-extension',openOptionsPage:async()=>{optionsOpened++;},sendMessage:async message=>{
    calls.push(message);
    if(message.type==='UI_OPENED'||message.type==='GET_STATE')return{ok:true,...state()};
    if(message.type==='CHECK_MULTI_SESSION'){
      if(failCheck)throw new Error('Worker unavailable');
      return{ok:true,multiSession:{status:currentMode},sessions:structuredClone(sessions)};
    }
    if(message.type==='SYNC_PORTAL'){config.portals.find(p=>p.id===message.portalId).syncStatus='syncing';return{ok:true};}
    if(message.type==='REORDER_ACCOUNT'){try{Object.assign(config,moveAccount(config,message));return{ok:true};}catch(e){return{ok:false,error:e.message};}}
    if(message.type==='CLOSE_SESSION'){
      if(closeError)return{ok:false,error:closeError};
      if(closeResult.confirmed)sessions.items=sessions.items.filter(i=>i.key!==message.key);
      return{ok:true,signOutRequested:true,...closeResult};
    }
    if(message.type==='LAUNCH'&&sessions.items.length>=5&&!sessions.items.some(i=>i.profileId===message.id))return{ok:true,sessionFull:true,sessions:structuredClone(sessions)};
    if(message.type==='LAUNCH')return currentMode!=='disabled'?{ok:true,focused:false}:{ok:true,launchBlocked:true,multiSession:{status:currentMode}};
    return{ok:false,error:'Unexpected test request'};
  }},permissions:{request:async()=>{permissionRequests++;return permissions;}},storage:{onChanged:{addListener:()=>{},removeListener:()=>{}}}};
  window.eval(bundle); await flush();
  t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));dom.window.close();});
  return {window,doc,calls,config,intervals,setMode:value=>{currentMode=value;},denyPermission:()=>{permissions=false;},failCheck:()=>{failCheck=true;},get optionsOpened(){return optionsOpened;},get permissionRequests(){return permissionRequests;},get closed(){return closed;},refresh:async()=>{window.dispatchEvent(new window.Event('focus'));await flush();},poll:async()=>{await [...intervals.values()][0].callback();await flush();}};
}

test('healthy popup shows toolbar and profiles without status panels or sync-on-open',async t=>{
  const ui=await popup(t), {doc}=ui;
  assert.equal(doc.querySelector('#search-panel').hidden,true);
  assert.equal(doc.querySelector('#multi-session').hidden,true);
  assert.equal(doc.querySelector('#portal-alerts').hidden,true);
  assert.equal(doc.querySelector('#popup-portal'),null);
  assert.equal(doc.querySelectorAll('.popup-toolbar button').length,3);
  assert.equal(doc.querySelectorAll('.profile-open').length,2);
  assert.equal(ui.calls.filter(c=>c.type==='SYNC_PORTAL').length,0);
  assert.equal(ui.permissionRequests,0);
  await ui.refresh();assert.equal(ui.calls.filter(c=>c.type==='SYNC_PORTAL').length,0);
});
test('account borders collect roles, show the number once, and keep keyboard launch in displayed order',async t=>{
  const dev={...profiles[0],favorite:true}, prod={...profiles[1],favorite:true};
  const readOnly=sanitizeProfile({...dev,permissionSet:'ReadOnly',favorite:false});
  const ui=await popup(t,{catalog:[dev,prod,readOnly]}),{doc,window}=ui;
  assert.equal(doc.querySelectorAll('.account-group').length,2);
  assert.equal(doc.querySelector('.account-group').querySelectorAll('.profile-open').length,2);
  assert.deepEqual([...doc.querySelectorAll('.account-group-id')].map(n=>n.textContent),[dev.accountId,prod.accountId]);
  for(const tile of doc.querySelectorAll('.profile-open'))assert.doesNotMatch(tile.textContent,/\d{12}/);
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  assert.equal(doc.querySelectorAll('.profile-row')[1].classList.contains('selected'),true);
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await flush();
  assert.equal(ui.calls.find(c=>c.type==='LAUNCH').id,readOnly.id);
  doc.querySelector('#toggle-search').click();const search=doc.querySelector('#search');search.value=prod.accountId;search.dispatchEvent(new window.Event('input'));
  assert.equal(doc.querySelectorAll('.account-group').length,1);assert.equal(doc.querySelector('.account-group-id').textContent,prod.accountId);
});
test('overlapping accounts from different portals keep distinct group context and launch identity',async t=>{
  const other=sanitizeProfile({...profiles[0],portalId:secondPortal});
  const ui=await popup(t,{multiple:true,catalog:[profiles[0],other]}),{doc}=ui;
  assert.equal(doc.querySelectorAll('.account-group').length,2);
  assert.deepEqual([...doc.querySelectorAll('.account-group-portal')].map(n=>n.textContent),['Work','Other']);
  doc.querySelectorAll('.profile-open')[1].click();await flush();assert.equal(ui.calls.find(c=>c.type==='LAUNCH').id,other.id);
});
test('legacy favorites no longer add pin controls or change the alphabetical role order',async t=>{
  const readOnly=sanitizeProfile({...profiles[0],permissionSet:'ReadOnly'});
  const ui=await popup(t,{catalog:[{...readOnly,favorite:true,pinnedAt:100},profiles[0],profiles[1]]}),{doc}=ui;
  assert.equal(doc.querySelector('.pin-button'),null);assert.equal(doc.querySelector('.profile-open strong').textContent,'Developer');
  assert.equal(doc.querySelectorAll('.profile-open').length,3);
});
test('a portal-only browser with unknown multi-session status keeps tiles clickable',async t=>{
  const ui=await popup(t,{mode:'unknown'});assert.equal(ui.doc.querySelector('#multi-session').hidden,true);assert.equal(ui.doc.querySelectorAll('.profile-open:disabled').length,0);
  ui.doc.querySelector('.profile-open').click();await flush();assert.equal(ui.closed,true);assert.equal(ui.calls.filter(c=>c.type==='LAUNCH').length,1);
});
test('a readable portal suppresses stale reconnect state and unknown access offers retry instead of claiming expiry',async t=>{
  const ready=await popup(t,{mode:'unknown',portalStatus:'sign-in-required',access:'ready'});assert.equal(ready.doc.querySelector('#portal-alerts').hidden,true);assert.equal(ready.doc.querySelectorAll('.profile-open:disabled').length,0);
  const unknown=await popup(t,{portalStatus:'sign-in-required',access:'unknown'});assert.equal(unknown.doc.querySelector('.portal-alert button').textContent,'Retry');assert.doesNotMatch(unknown.doc.querySelector('#portal-alerts').textContent,/sign-in required|Reconnect/);
});
test('search is revealed on demand, filters profiles, and Escape clears then collapses',async t=>{
  const {window,doc}=await popup(t);
  doc.querySelector('#toggle-search').click();assert.equal(doc.querySelector('#search-panel').hidden,false);assert.equal(doc.activeElement.id,'search');
  const search=doc.querySelector('#search');search.value='production';search.dispatchEvent(new window.Event('input'));
  assert.equal(doc.querySelectorAll('.profile-open').length,1);assert.equal(doc.querySelector('#count').textContent,'1 of 2');
  search.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(search.value,'');assert.equal(doc.querySelectorAll('.profile-open').length,2);
  search.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(doc.querySelector('#search-panel').hidden,true);assert.equal(doc.activeElement.id,'toggle-search');
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));assert.equal(doc.activeElement.id,'search');
});
test('30 second checks reveal lost multi-session support and hide the alert after recovery',async t=>{
  const ui=await popup(t), {doc}=ui;
  assert.equal([...ui.intervals.values()][0].ms,30000);
  ui.setMode('disabled');await ui.poll();assert.equal(doc.querySelector('#multi-session').hidden,false);assert.equal(doc.querySelectorAll('.profile-open:disabled').length,0);
  ui.setMode('enabled');await ui.poll();assert.equal(doc.querySelector('#multi-session').hidden,true);assert.equal(doc.querySelectorAll('.profile-open:disabled').length,0);
  assert.equal(ui.calls.filter(c=>c.type==='SYNC_PORTAL').length,0);
});
test('monitor pauses in hidden views and stops on close; inconclusive checks do not claim disabled',async t=>{
  const ui=await popup(t), {doc,window}=ui;
  Object.defineProperty(doc,'hidden',{value:true,configurable:true});await ui.poll();assert.equal(ui.calls.filter(c=>c.type==='CHECK_MULTI_SESSION').length,0);
  Object.defineProperty(doc,'hidden',{value:false,configurable:true});ui.failCheck();await ui.poll();assert.equal(doc.querySelector('#multi-session').hidden,true);assert.equal(doc.querySelectorAll('.profile-open:disabled').length,0);
  window.dispatchEvent(new window.Event('pagehide'));assert.equal(ui.intervals.size,0);
});
test('a loss between polls is caught on launch and recovery leaves no stale warning',async t=>{
  const ui=await popup(t),{doc}=ui;
  ui.setMode('disabled');doc.querySelector('.profile-open').click();await flush();
  assert.equal(ui.closed,false);assert.equal(doc.querySelector('#multi-session').hidden,false);assert.equal(doc.querySelector('#status').hidden,true);
  ui.setMode('enabled');await ui.poll();assert.equal(doc.querySelector('#multi-session').hidden,true);assert.equal(doc.querySelector('#status').hidden,true);
});
test('toolbar sync is explicit and suppresses duplicate clicks while a sync is running',async t=>{
  const ui=await popup(t), {doc}=ui;
  doc.querySelector('#sync').click();await flush();assert.equal(ui.permissionRequests,1);assert.equal(ui.calls.filter(c=>c.type==='SYNC_PORTAL').length,1);assert.equal(doc.querySelector('#sync').disabled,true);
  doc.querySelector('#sync').click();await flush();assert.equal(ui.calls.filter(c=>c.type==='SYNC_PORTAL').length,1);
  ui.config.portals[0].syncStatus='synced';await ui.refresh();assert.equal(doc.querySelector('#portal-alerts').hidden,true);assert.equal(doc.querySelector('#sync').disabled,false);
});
test('reconnect is shown only for portal problems, and a refused permission cannot start sync',async t=>{
  const ui=await popup(t),{doc}=ui;
  ui.config.portals[0].syncStatus='sign-in-required';await ui.refresh();assert.equal(doc.querySelector('#portal-alerts').hidden,false);assert.equal(doc.querySelector('.portal-alert button').textContent,'Reconnect');
  ui.denyPermission();doc.querySelector('.portal-alert button').click();await flush();assert.equal(ui.calls.filter(c=>c.type==='SYNC_PORTAL').length,0);assert.equal(doc.querySelector('#status').hidden,false);
});
test('multiple portals show a chooser only after clicking sync and use the selected portal',async t=>{
  const ui=await popup(t,{multiple:true}),{doc}=ui;
  assert.equal(doc.querySelector('#sync-panel').hidden,true);doc.querySelector('#sync').click();await flush();assert.equal(doc.querySelector('#sync-panel').hidden,false);assert.equal(ui.calls.filter(c=>c.type==='SYNC_PORTAL').length,0);
  doc.querySelector('#portal-picker').value=secondPortal;doc.querySelector('#sync-selected').click();await flush();assert.equal(ui.calls.find(c=>c.type==='SYNC_PORTAL').portalId,secondPortal);assert.equal(doc.querySelector('#sync-panel').hidden,true);
});
test('missing portal still routes to setup without a sync',async t=>{
  const ui=await popup(t,{setup:true,mode:'unknown'});assert.equal(ui.optionsOpened,1);assert.equal(ui.closed,true);assert.equal(ui.calls.filter(c=>c.type==='SYNC_PORTAL').length,0);
});
test('session count includes hidden profiles; marker remains after pin removal and closes without launching',async t=>{
  const sessions={items:[{key:'first',accountId:profiles[0].accountId,profileId:profiles[0].id,permissionSet:'Developer'},{key:'hidden',accountId:'999988887777',permissionSet:'Admin'}],limit:5,complete:true};
  const ui=await popup(t,{sessions}),{doc}=ui;
  assert.equal(doc.querySelector('#session-count').textContent,'2 / 5 sessions');
  const row=doc.querySelector('.profile-row');assert.equal(row.querySelector('.pin-button'),null);assert.equal(row.lastElementChild,row.querySelector('.session-button'));
  assert.equal(doc.querySelectorAll('.profile-row .session-button').length,1);
  assert.equal(doc.querySelectorAll('.session-entry .session-button').length,2);
  row.querySelector('.session-button').click();await flush();await flush();
  assert.equal(ui.calls.filter(c=>c.type==='LAUNCH').length,0);assert.equal(ui.calls.find(c=>c.type==='CLOSE_SESSION').key,'first');
  assert.equal(doc.querySelector('#session-count').textContent,'1 / 5 sessions');assert.equal(doc.querySelector('.profile-row .session-button'),null);
  assert.equal(doc.querySelector('#status').textContent,'Session signed out.');assert.equal(ui.closed,false);
  sessions.items=[];await ui.poll();assert.equal(doc.querySelector('#session-count').textContent,'0 / 5 sessions');
});
test('failed and unconfirmed sign-outs retain capacity and show errors without closing popup',async t=>{
  for(const options of [{closeResult:{confirmed:false}},{closeError:'AWS did not expose a verified sign-out link.'}]){
    const sessions={items:[{key:'first',accountId:profiles[0].accountId,profileId:profiles[0].id,permissionSet:'Developer'}],limit:5,complete:true};
    const ui=await popup(t,{sessions,...options}),{doc}=ui;
    doc.querySelector('.profile-row .session-button').click();await flush();await flush();
    assert.equal(doc.querySelector('#session-count').textContent,'1 / 5 sessions');assert.equal(ui.closed,false);
    assert.match(doc.querySelector('#status').textContent,/not confirmed|verified sign-out link/);
    assert.equal(doc.querySelector('#status').hidden,false);assert.equal(doc.querySelector('.profile-row .session-button').disabled,false);
    assert.equal(ui.calls.filter(c=>c.type==='LAUNCH').length,0);
  }
});
test('capacity warning keeps the popup open and exposes all sessions to close',async t=>{
  const sessions={items:Array.from({length:5},(_,i)=>({key:'session'+i,accountId:'999988887777',permissionSet:'Role'+i})),limit:5,complete:true};
  const ui=await popup(t,{sessions}),{doc}=ui;
  doc.querySelector('.profile-open').click();await flush();assert.equal(ui.closed,false);
  assert.match(doc.querySelector('#status').textContent,/Close a session/);assert.equal(doc.querySelector('#session-panel').hidden,false);
  assert.equal(doc.querySelectorAll('.session-entry .session-button').length,5);
});
test('active account borders follow hidden-role sessions and portal identity; session count shares the heading',async t=>{
  const hidden=sanitizeProfile({...profiles[0],permissionSet:'HiddenRole',showInPopup:false});
  const other=sanitizeProfile({...profiles[0],portalId:secondPortal});
  const sessions={items:[{key:'hidden-role',profileId:hidden.id,accountId:hidden.accountId,permissionSet:hidden.permissionSet}],limit:5,complete:true};
  const ui=await popup(t,{multiple:true,catalog:[profiles[0],hidden,other],sessions}),{doc}=ui;
  const groups=[...doc.querySelectorAll('.account-group')];
  assert.equal(groups[0].classList.contains('has-session'),true);assert.equal(groups[1].classList.contains('has-session'),false);
  assert.equal(doc.querySelectorAll('.profile-row .session-button').length,0);
  assert.ok(doc.querySelector('#list-heading #session-count'));assert.ok(doc.querySelector('#list-heading #count'));
  const toggle=doc.querySelector('#session-count');assert.equal(doc.querySelector('#session-panel').hidden,true);
  toggle.click();assert.equal(doc.querySelector('#session-panel').hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
  toggle.click();assert.equal(doc.querySelector('#session-panel').hidden,true);assert.equal(toggle.getAttribute('aria-expanded'),'false');
  sessions.items=[];await ui.poll();assert.equal(doc.querySelectorAll('.account-group.has-session').length,0);
});
test('popup headers reorder whole accounts by keyboard and keep role keyboard navigation aligned',async t=>{
  const readOnly=sanitizeProfile({...profiles[0],permissionSet:'ReadOnly'});
  const ui=await popup(t,{catalog:[profiles[0],readOnly,profiles[1]]});const {doc,window,calls,config}=ui;
  const header=doc.querySelector('.account-group-legend');assert.equal(header.draggable,true);assert.match(header.title,/Drag to reorder/);
  header.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true,cancelable:true}));await flush();await flush();
  assert.equal(calls.find(c=>c.type==='REORDER_ACCOUNT').position,'after');assert.equal(doc.querySelector('.account-group-id').textContent,profiles[1].accountId);
  assert.equal(doc.querySelectorAll('.account-group')[1].querySelectorAll('.profile-row').length,2);assert.equal(config.ui.accountOrder.length,2);
  assert.equal(doc.activeElement,doc.querySelectorAll('legend')[1]);await ui.refresh();assert.equal(doc.activeElement,doc.querySelectorAll('legend')[1]);
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await flush();assert.equal(calls.find(c=>c.type==='LAUNCH').id,profiles[1].id);
});
test('session overlay dismisses independently with Escape, outside clicks and close button',async t=>{
  const ui=await popup(t,{sessions:{items:[{key:'active',accountId:profiles[0].accountId,profileId:profiles[0].id,permissionSet:'Developer'}],limit:5,complete:true}}),{doc,window}=ui;
  const trigger=doc.querySelector('#session-count'),panel=doc.querySelector('#session-panel');
  assert.equal(panel.closest('.popup-main'),null);assert.equal(panel.getAttribute('role'),'dialog');
  trigger.click();assert.equal(doc.activeElement,panel);
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await flush();assert.equal(ui.calls.filter(c=>c.type==='LAUNCH').length,0);
  panel.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(panel.hidden,true);assert.equal(doc.activeElement,trigger);assert.equal(ui.closed,false);
  trigger.click();panel.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));assert.equal(panel.hidden,false);
  doc.querySelector('#list-heading').dispatchEvent(new window.Event('pointerdown',{bubbles:true}));assert.equal(panel.hidden,true);assert.equal(trigger.getAttribute('aria-expanded'),'false');
  trigger.click();doc.querySelector('#close-sessions').click();assert.equal(panel.hidden,true);assert.equal(doc.activeElement,trigger);
  assert.equal(ui.calls.filter(c=>c.type==='LAUNCH'||c.type==='CLOSE_SESSION').length,0);
});
