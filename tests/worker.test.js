import {accountKey} from '../src/core/account-order.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyConfig,sanitizeProfile} from '../src/core/model.js';
const memory={local:{},session:{}};
const listeners={message:[],removed:[],updated:[],startup:[],alarms:[]};
const event=key=>({addListener:fn=>listeners[key].push(fn)});
let openTabs=[],created=[],focused=[],scriptIdentity=null,scriptModes={},portalReads={},groups=[],groupCalls=[],granted=true,alarmState=new Map();
const storage=area=>({async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(memory[area][key])]));},async set(update){Object.assign(memory[area],structuredClone(update));},async setAccessLevel(){}});
globalThis.chrome={runtime:{id:'test-extension',getURL:path=>`chrome-extension://test-extension/${path}`,onMessage:event('message'),onStartup:event('startup')},storage:{local:storage('local'),session:storage('session')},permissions:{contains:async()=>granted},scripting:{executeScript:async options=>options.func?[{result:options.func.name==='readMultiSession'?(scriptModes[options.target.tabId]||{status:'unknown'}):options.func.name==='readPortalAccess'?(portalReads[options.target.tabId]||{status:'unknown'}):scriptIdentity}]:[]},alarms:{get:async name=>alarmState.get(name),create:async(name,value)=>alarmState.set(name,value),onAlarm:event('alarms')},windows:{update:async()=>{}},tabs:{query:async()=>openTabs,get:async id=>{const tab=openTabs.find(t=>t.id===id);if(!tab)throw new Error('Missing tab');return tab;},create:async data=>{created.push(data);const tab={id:200+created.length,windowId:1,status:'loading',...data};openTabs.push(tab);return tab;},remove:async id=>{openTabs=openTabs.filter(t=>t.id!==id);},update:async(id,data)=>{focused.push(id);const tab=openTabs.find(t=>t.id===id);Object.assign(tab,data);if(data.url)tab.status='loading';return tab;},sendMessage:async()=>({ok:true}),onRemoved:event('removed'),onUpdated:event('updated')}};
chrome.tabGroups={query:async ({windowId})=>groups.filter(g=>g.windowId===windowId),update:async(id,props)=>{const group=groups.find(g=>g.id===id);if(!group)throw new Error('Missing group');Object.assign(group,props);return group;}};
chrome.tabs.group=async options=>{groupCalls.push(options);let id=options.groupId;if(id==null){id=50+groups.length;groups.push({id,windowId:options.createProperties.windowId});}for(const tabId of options.tabIds)openTabs.find(t=>t.id===tabId).groupId=id;return id;};
await import('../src/background/worker.js');
const ui={id:'test-extension',url:'chrome-extension://test-extension/options.html',tab:{id:99}};
const portal='https://example.awsapps.com/start/';
const p=sanitizeProfile({portalId:portal,accountId:'111122223333',accountName:'Dev',permissionSet:'Developer',theme:'dark',favorite:true});
function reset(){memory.local.config={...emptyConfig(),portals:[{id:portal,baseUrl:portal,label:'Work'}],profiles:[p]};memory.session={};created=[];focused=[];openTabs=[];scriptIdentity=null;scriptModes={};portalReads={};groups=[];groupCalls=[];granted=true;}
const completeTab=async(id,url=portal)=>{const tab=openTabs.find(t=>t.id===id);Object.assign(tab,{url,status:'complete'});await listeners.updated.at(-1)(id,{status:'complete'},tab);};
async function startSync(){assert.equal((await send('SYNC_PORTAL',{portalId:portal})).ok,true);const id=memory.session.connections[portal].tabId;await completeTab(id);return{jobId:memory.session.draft.jobId,sender:{id:'test-extension',url:portal,tab:{id},frameId:0}};}
const send=(type,fields={},sender=ui)=>new Promise(resolve=>listeners.message.at(-1)({type,...fields},sender,resolve));
test('background coordinator preserves trust boundaries and state',async t=>{
  await t.test('accepts own options page even if Chrome includes a tab sender',async()=>{reset();const state=await send('GET_STATE');assert.equal(state.ok,true);assert.equal(state.config.profiles[0].theme,'dark');});
  await t.test('rejects content-page configuration mutations and unknown messages',async()=>{reset();const bad=await send('DELETE_PROFILE',{id:p.id},{id:'test-extension',url:'https://example.awsapps.com/start/',tab:{id:2}});assert.equal(bad.ok,false);assert.equal(memory.local.config.profiles.length,1);assert.equal((await send('UNKNOWN')).ok,false);});
  await t.test('rejects another extension origin even when both URL origins serialize as null',async()=>{
    reset();const result=await send('GET_STATE',{}, {...ui,url:'chrome-extension://different-extension/options.html'});assert.equal(result.ok,false);
  });
  await t.test('validates console sender, full identity and exact role before recording',async()=>{
    reset();const identity={accountId:p.accountId,permissionSet:p.permissionSet,sessionHost:'us-east-1.console.aws.amazon.com'};
    const sender={id:'test-extension',url:'https://us-east-1.console.aws.amazon.com/console/home',tab:{id:5},frameId:0};
    const result=await send('CONSOLE_IDENTITY',{identity},sender);assert.equal(result.profile.id,p.id);assert.equal(memory.session.observed[5].profileId,p.id);
    assert.equal((await send('CONSOLE_IDENTITY',{identity},{...sender,frameId:2})).ok,false);
    await send('CONSOLE_IDENTITY',{identity:{...identity,permissionSet:'OtherRole'}},sender);assert.equal(memory.session.observed[5],undefined);
  });
  await t.test('stale observed tab cannot focus a different current identity',async()=>{
    reset();openTabs=[{id:5,windowId:1,url:'https://us-east-1.console.aws.amazon.com/console/home'}];memory.session.observed={5:{tabId:5,profileId:p.id}};scriptIdentity={accountId:p.accountId,permissionSet:'OtherRole'};
    scriptModes[5]={status:'enabled',source:'session-url'};
    const result=await send('LAUNCH',{id:p.id});assert.equal(result.focused,false);assert.equal(focused.length,0);assert.equal(created.length,1);assert.ok(created[0].url.includes('role_name=Developer'));
  });
  await t.test('exact identity is rechecked and existing tab focused without new login',async()=>{
    reset();openTabs=[{id:5,windowId:1,url:'https://us-east-1.console.aws.amazon.com/console/home'}];scriptModes[5]={status:'enabled',source:'console-control'};memory.session.observed={5:{tabId:5,profileId:p.id}};scriptIdentity={accountId:p.accountId,permissionSet:p.permissionSet};assert.equal((await send('LAUNCH',{id:p.id})).focused,true);assert.deepEqual(focused,[5]);assert.equal(created.length,0);
  });
  await t.test('unknown multi-session allows the first grouped launch; explicit disabled evidence blocks new federation',async()=>{
    reset();let result=await send('LAUNCH',{id:p.id});assert.equal(result.focused,false);assert.equal(created.length,1);assert.equal(groups[0].title,'AWS SSO');assert.equal(groups[0].color,'orange');
    reset();openTabs=[{id:5,windowId:1,url:'https://us-east-1.console.aws.amazon.com/'}];scriptModes[5]={status:'disabled',source:'console-control'};
    result=await send('LAUNCH',{id:p.id});assert.equal(result.launchBlocked,true);assert.equal(created.length,0);
  });
  await t.test('native sessions override stale landing-page controls, but spoofed UI flags cannot bypass an explicit disabled result',async()=>{
    reset();openTabs=[{id:5,url:'https://111122223333-abcdefgh.console.aws.amazon.com/'},{id:6,url:'https://console.aws.amazon.com/'}];scriptModes={6:{status:'disabled',source:'console-control'}};
    assert.equal((await send('CHECK_MULTI_SESSION')).multiSession.status,'enabled');
    openTabs=[openTabs[1]];assert.equal((await send('LAUNCH',{id:p.id,multiSession:{status:'enabled'}})).launchBlocked,true);assert.equal(created.length,0);
    assert.equal((await send('OPEN_MULTI_SESSION_SETUP',{}, {id:'test-extension',url:portal,tab:{id:2}})).ok,false);
  });
  await t.test('session URLs are positive evidence even if a console cannot yet be injected',async()=>{
    reset();openTabs=[{id:5,windowId:1,url:'https://111122223333-abc.console.aws.amazon.com/'}];
    const execute=chrome.scripting.executeScript;
    try {
      chrome.scripting.executeScript=async()=>{throw new Error('Old document cannot be injected');};
      assert.equal((await send('CHECK_MULTI_SESSION')).multiSession.status,'enabled');assert.equal((await send('LAUNCH',{id:p.id})).focused,false);
    } finally { chrome.scripting.executeScript=execute; }
    assert.equal(created.length,1);
  });
  await t.test('setup opens the normal console without federating a profile and reuses an existing console',async()=>{
    reset();await send('OPEN_MULTI_SESSION_SETUP');assert.deepEqual(created,[{url:'https://console.aws.amazon.com/'}]);
    await send('OPEN_MULTI_SESSION_SETUP');assert.equal(created.length,1);assert.deepEqual(focused,[201]);assert.equal((await send('CHECK_MULTI_SESSION')).multiSession.status,'unknown');
  });
  await t.test('matching a live account and permission set works without the observation cache',async()=>{
    reset();openTabs=[{id:8,windowId:1,url:'https://us-east-1.console.aws.amazon.com/console/home'}];scriptIdentity={accountId:p.accountId,permissionSet:p.permissionSet};
    scriptModes[8]={status:'disabled',source:'console-control'};
    const result=await send('LAUNCH',{id:p.id});assert.equal(result.focused,true);assert.deepEqual(focused,[8]);assert.equal(created.length,0);assert.equal(groups[0].title,'AWS SSO');
  });
  await t.test('repeated clicks during SSO focus the same pending tab and reuse the configured group',async()=>{
    reset();await send('SET_TAB_GROUP',{name:'Work accounts'});assert.equal((await send('LAUNCH',{id:p.id})).focused,false);
    const id=openTabs[0].id;assert.equal((await send('LAUNCH',{id:p.id})).focused,true);assert.equal(created.length,1);assert.equal(groups[0].title,'Work accounts');
    // IdP URLs may be unavailable without granting access to identity providers.
    delete openTabs[0].url;assert.equal((await send('LAUNCH',{id:p.id})).pending,true);assert.equal(created.length,1);
    await listeners.removed.at(-1)(id);assert.equal(memory.session.launches[id],undefined);
  });
  await t.test('a different role gets a new tab in the same group, never the other role tab',async()=>{
    reset();const other=sanitizeProfile({...p,permissionSet:'ReadOnly'});memory.local.config.profiles.push(other);
    await send('LAUNCH',{id:p.id});await completeTab(openTabs[0].id,'https://111122223333-abcdefgh.console.aws.amazon.com/');scriptIdentity={accountId:p.accountId,permissionSet:p.permissionSet};
    const result=await send('LAUNCH',{id:other.id});assert.equal(result.focused,false);assert.equal(created.length,2);assert.equal(groups.length,1);assert.equal(openTabs[0].groupId,openTabs[1].groupId);
  });
  await t.test('tab-group names are literal, per-window, validated, and existing groups are expanded',async()=>{
    reset();groups=[{id:1,title:'AWS SSO',windowId:2,collapsed:true}];await send('LAUNCH',{id:p.id});assert.equal(groups.length,2);assert.equal(groups[1].windowId,1);
    assert.equal((await send('SET_TAB_GROUP',{name:''})).ok,false);assert.equal((await send('SET_TAB_GROUP',{name:'x'.repeat(81)})).ok,false);
    reset();await send('SET_TAB_GROUP',{name:'AWS*'});groups=[{id:3,title:'AWS SSO',windowId:1}];await send('LAUNCH',{id:p.id});assert.equal(groups.length,2);assert.equal(groups[1].title,'AWS*');
    reset();groups=[{id:4,title:'AWS SSO',windowId:1,collapsed:true}];await send('LAUNCH',{id:p.id});assert.equal(groups.length,1);assert.equal(groups[0].collapsed,false);
  });
  await t.test('grouping failure does not lose the opened tab or create duplicates on retry',async()=>{
    reset();const group=chrome.tabs.group;
    try {chrome.tabs.group=async()=>{throw new Error('Permission unavailable');};const result=await send('LAUNCH',{id:p.id});assert.equal(result.ok,true);assert.ok(result.warning);assert.equal(created.length,1);}
    finally {chrome.tabs.group=group;}
    assert.equal((await send('LAUNCH',{id:p.id})).focused,true);assert.equal(created.length,1);
  });
  await t.test('a live Accounts page clears a stale reconnect warning without changing profiles or sync timestamps',async()=>{
    reset();memory.local.config.portals[0].syncStatus='sign-in-required';memory.local.config.portals[0].lastImportAt=1234;
    openTabs=[{id:7,windowId:1,url:portal}];portalReads[7]={status:'ready'};
    const state=await send('UI_OPENED');assert.equal(state.config.portals[0].syncStatus,'idle');assert.equal(state.config.portals[0].lastImportAt,1234);assert.equal(state.config.profiles.length,1);assert.equal(created.length,0);assert.equal(state.portalAccess[portal],'ready');
  });
  await t.test('unknown portal access is not called expired; explicit sign-in remains actionable',async()=>{
    reset();memory.local.config.portals[0].syncStatus='sign-in-required';openTabs=[{id:7,url:portal}];
    assert.equal((await send('GET_STATE')).portalAccess[portal],'unknown');portalReads[7]={status:'sign-in-required'};
    assert.equal((await send('GET_STATE')).portalAccess[portal],'sign-in-required');assert.equal(created.length,0);
  });
  await t.test('profile colors save narrowly, validate input, and survive portal synchronization',async()=>{
    reset();await send('SET_VISIBILITY',{id:p.id,show:false});assert.equal((await send('SET_COLOR',{id:p.id,color:'#ab12ef'})).ok,true);
    assert.equal(memory.local.config.profiles[0].theme,'dark');assert.equal(memory.local.config.profiles[0].showInPopup,false);
    assert.equal((await send('SET_COLOR',{id:p.id,color:'red;display:none'})).ok,false);
    assert.equal((await send('SET_COLOR',{id:'missing',color:'#123456'})).ok,false);
    const {jobId,sender}=await startSync();await send('SCAN_RESULT',{jobId,result:{candidates:[p],warnings:[],complete:true,progress:{accounts:1,profiles:1,pages:1}}},sender);
    assert.equal(memory.local.config.profiles[0].color,'#ab12ef');
  });
  await t.test('account order saves trusted relative moves and survives worker reload and portal sync',async()=>{
    reset();const b=sanitizeProfile({...p,accountId:'444455556666',accountName:'Bravo',favorite:false}),d=sanitizeProfile({...p,accountId:'777788889999',accountName:'Delta',favorite:false});memory.local.config.profiles.push(b,d);
    const change={sourceKey:accountKey(b),targetKey:accountKey(d),position:'after'};
    assert.equal((await send('REORDER_ACCOUNT',change,{id:'test-extension',url:portal,tab:{id:7}})).ok,false);
    assert.equal((await send('REORDER_ACCOUNT',change)).ok,true);const saved=[accountKey(d),accountKey(b),accountKey(p)];assert.deepEqual(memory.local.config.ui.accountOrder,saved);
    assert.equal((await send('REORDER_ACCOUNT',{...change,sourceKey:'missing'})).ok,false);
    await import('../src/background/worker.js?account-order-reload');assert.deepEqual((await send('GET_STATE')).config.ui.accountOrder,saved);
    const {jobId,sender}=await startSync();await send('SCAN_RESULT',{jobId,result:{candidates:[p,b,d],warnings:[],complete:true,progress:{accounts:3,profiles:3,pages:1}}},sender);assert.deepEqual(memory.local.config.ui.accountOrder,saved);
    await send('REORDER_ACCOUNT',{sourceKey:accountKey(b),targetKey:accountKey(d),position:'before'});assert.equal(memory.local.config.ui.accountOrder[0],accountKey(b));
    const incoming={...emptyConfig(),portals:[],profiles:[]};await send('IMPORT_CONFIG',{config:incoming});assert.equal(memory.local.config.ui.accountOrder[0],accountKey(b));
  });
  await t.test('custom palette slots validate trusted edits and survive reload, sync and imports',async()=>{
    reset();assert.equal((await send('SET_CUSTOM_COLOR',{index:0,color:'#AABBCC'})).ok,true);
    assert.equal(memory.local.config.ui.customColors[0],'#aabbcc');assert.equal(memory.local.config.profiles[0].color,p.color);
    for(const index of [-1,4,1.5,'0'])assert.equal((await send('SET_CUSTOM_COLOR',{index,color:'#123456'})).ok,false);
    assert.equal((await send('SET_CUSTOM_COLOR',{index:1,color:'red;display:none'})).ok,false);
    assert.equal((await send('SET_CUSTOM_COLOR',{index:1,color:'#123456'},{id:'test-extension',url:portal,tab:{id:7}})).ok,false);
    await import('../src/background/worker.js?palette-reload-test');assert.equal((await send('GET_STATE')).config.ui.customColors[0],'#aabbcc');
    const {jobId,sender}=await startSync();await send('SCAN_RESULT',{jobId,result:{candidates:[p],warnings:[],complete:true,progress:{accounts:1,profiles:1,pages:1}}},sender);
    assert.equal(memory.local.config.ui.customColors[0],'#aabbcc');
    const incoming={...emptyConfig(),portals:[],profiles:[]};await send('IMPORT_CONFIG',{config:incoming});assert.equal(memory.local.config.ui.customColors[0],'#aabbcc');
    incoming.ui.customColors=[null,'#123456',null,null];await send('IMPORT_CONFIG',{config:incoming});assert.deepEqual(memory.local.config.ui.customColors,['#aabbcc','#123456',null,null]);
  });
  await t.test('retired pin commands cannot mutate preferences or ordering',async()=>{
    reset();const before=structuredClone(memory.local.config);
    assert.equal((await send('PIN_PROFILE',{id:p.id})).ok,false);assert.equal((await send('FAVORITE',{id:p.id})).ok,false);
    assert.deepEqual(memory.local.config,before);const state=await send('GET_STATE');assert.equal(state.config.profiles[0].favorite,undefined);assert.equal(state.config.profiles[0].pinnedAt,undefined);
  });
  await t.test('portal scanner needs granted host access and rejects wrong tab/job reports',async()=>{
    reset();granted=false;assert.equal((await send('SYNC_PORTAL',{portalId:portal})).ok,false);granted=true;const {jobId:job,sender}=await startSync();
    assert.equal((await send('SCAN_PROGRESS',{jobId:job,progress:{accounts:1,profiles:1,pages:1}},{...sender,tab:{id:8}})).ok,false);
    assert.equal((await send('SCAN_RESULT',{jobId:job,result:{candidates:[p],warnings:[],complete:true,progress:{accounts:1,profiles:1,pages:1}}},sender)).ok,true);
    assert.equal(memory.session.draft.status,'saved');assert.equal(memory.local.config.profiles[0].theme,'dark');
  });
  await t.test('worker recreation reads saved catalog and persisted draft',async()=>{
    reset();memory.session.draft={jobId:'saved-job',status:'ready',complete:false,candidates:[p],warnings:[],progress:{accounts:1,profiles:1,pages:1}};
    await import('../src/background/worker.js?restart-test');const result=await send('GET_STATE');assert.equal(result.config.profiles[0].id,p.id);assert.equal(result.draft.jobId,'saved-job');
  });
  await t.test('cancellation accepts the final partial results without replacing saved profiles',async()=>{
    reset();const {jobId:job,sender}=await startSync();
    await send('CANCEL_SCAN');assert.equal(memory.session.draft.status,'cancelling');assert.equal((await send('START_SCAN',{portalId:portal})).ok,false);
    const invalid=await send('SCAN_RESULT',{jobId:job,result:{candidates:[p],warnings:[],complete:true,progress:{accounts:-1,profiles:1,pages:1}}},sender);assert.equal(invalid.ok,false);
    const result=await send('SCAN_RESULT',{jobId:job,result:{candidates:[p],warnings:['Cancelled.'],complete:true,progress:{accounts:1,profiles:1,pages:1}}},sender);
    assert.equal(result.ok,true);assert.equal(memory.session.draft.status,'cancelled');assert.equal(memory.session.draft.complete,false);assert.equal(memory.session.draft.candidates.length,1);assert.equal(memory.local.config.profiles[0].theme,'dark');
  });
  await t.test('all discovered profiles auto-save and survive reload with visibility preferences',async()=>{
    reset();memory.local.config.profiles=[];
    const extra=sanitizeProfile({...p,permissionSet:'ReadOnly'});
    const {jobId,sender}=await startSync();
    const result=await send('SCAN_RESULT',{jobId,result:{candidates:[p,extra],warnings:[],complete:true,progress:{accounts:1,profiles:2,pages:1}}},sender);
    assert.equal(result.ok,true);assert.equal(memory.local.config.profiles.length,2);
    await send('SET_VISIBILITY',{id:p.id,show:false});
    memory.session={};await import('../src/background/worker.js?full-reload-test');
    const state=await send('GET_STATE');assert.equal(state.draft,null);assert.equal(state.config.profiles.length,2);assert.equal(state.config.profiles.find(x=>x.id===p.id).showInPopup,false);
    const next=await startSync();await send('SCAN_RESULT',{jobId:next.jobId,result:{candidates:[p,extra],warnings:[],complete:true,progress:{accounts:1,profiles:2,pages:1}}},next.sender);
    assert.equal(memory.local.config.profiles.find(x=>x.id===p.id).showInPopup,false);
  });
  await t.test('scheduled sync respects due time and manual-only preference, recreates missing alarm',async()=>{
    reset();await send('SET_SYNC_INTERVAL',{portalId:portal,minutes:0});
    await listeners.alarms.at(-1)({name:'portal-sync-check'});assert.equal(created.length,0);
    await send('SET_SYNC_INTERVAL',{portalId:portal,minutes:15});
    memory.local.config.portals[0].lastAttemptAt=Date.now();
    await listeners.alarms.at(-1)({name:'portal-sync-check'});assert.equal(created.length,0);
    memory.local.config.portals[0].lastAttemptAt=Date.now()-16*60000;
    await listeners.alarms.at(-1)({name:'portal-sync-check'});assert.equal(created.length,1);assert.equal(created[0].active,false);
    assert.equal((await send('SET_SYNC_INTERVAL',{portalId:portal,minutes:2})).ok,false);
    alarmState.clear();memory.session={};await import('../src/background/worker.js?alarm-reload');await send('GET_STATE');assert.equal(alarmState.get('portal-sync-check').periodInMinutes,5);
  });
  await t.test('SSO redirect pauses sync, resumes on return and never injects into Microsoft',async()=>{
    reset();await send('SYNC_PORTAL',{portalId:portal});const tabId=memory.session.connections[portal].tabId;
    await completeTab(tabId,'https://login.microsoftonline.com/signin');
    assert.equal(memory.local.config.portals[0].syncStatus,'sign-in-required');assert.equal(memory.session.draft,undefined);
    await listeners.alarms.at(-1)({name:'portal-sync-check'});assert.equal(created.length,1);
    await completeTab(tabId);assert.equal(memory.session.draft.status,'scanning');
    assert.equal(memory.local.config.profiles.length,1);
  });
  await t.test('unavailable access preserves catalog and tries one normal reauthentication navigation',async()=>{
    reset();const {jobId,sender}=await startSync();
    const result={candidates:[],warnings:['Sign in again.'],complete:false,accessUnavailable:true,progress:{accounts:0,profiles:0,pages:0}};
    await send('SCAN_RESULT',{jobId,result},sender);
    assert.equal(memory.local.config.profiles.length,1);assert.notEqual(memory.local.config.profiles[0].availability,'not-seen');
    assert.equal(memory.session.connections[portal].reauthTried,true);assert.equal(created.length,1);
    await completeTab(sender.tab.id);const retry=memory.session.draft.jobId;
    await send('SCAN_RESULT',{jobId:retry,result},sender);
    assert.equal(memory.local.config.portals[0].syncStatus,'sign-in-required');assert.equal(created.length,1);
    const prior=focused.length;await listeners.alarms.at(-1)({name:'portal-sync-check'});assert.equal(focused.length,prior);
  });
  await t.test('automatic sync closes only its own inactive tab, leaving user tabs intact',async()=>{
    reset();openTabs=[{id:7,windowId:1,url:portal,active:true}];
    await listeners.alarms.at(-1)({name:'portal-sync-check'});const id=memory.session.connections[portal].tabId;await completeTab(id);
    const jobId=memory.session.draft.jobId;
    await send('SCAN_RESULT',{jobId,result:{candidates:[p],complete:true,warnings:[],progress:{accounts:1,profiles:1,pages:1}}},{id:'test-extension',url:portal,tab:{id},frameId:0});
    assert.ok(openTabs.some(t=>t.id===7));assert.ok(!openTabs.some(t=>t.id===id));
  });

  await t.test('navigation during a scan interrupts the job and resumes after portal sign-in',async()=>{
    reset();const first=await startSync();const id=first.sender.tab.id;
    await listeners.updated.at(-1)(id,{status:'loading'},openTabs.find(t=>t.id===id));
    assert.equal(memory.session.draft.status,'interrupted');
    await completeTab(id,'https://login.microsoftonline.com/signin');assert.equal(memory.local.config.portals[0].syncStatus,'sign-in-required');
    await completeTab(id);assert.equal(memory.session.draft.status,'scanning');assert.notEqual(memory.session.draft.jobId,first.jobId);
    assert.equal((await send('SCAN_PROGRESS',{jobId:first.jobId,progress:{accounts:1,profiles:1,pages:1}},first.sender)).ok,false);
    assert.equal(memory.local.config.profiles.length,1);
  });
  await t.test('complete sync marks missing entries, partial sync keeps the old catalog',async()=>{
    reset();const missing=sanitizeProfile({...p,permissionSet:'OldRole',showInPopup:false});memory.local.config.profiles.push(missing);
    let job=await startSync();await send('SCAN_RESULT',{jobId:job.jobId,result:{candidates:[p],warnings:[],complete:false,progress:{accounts:1,profiles:1,pages:1}}},job.sender);
    assert.notEqual(memory.local.config.profiles.find(x=>x.id===missing.id).availability,'not-seen');
    job=await startSync();await send('SCAN_RESULT',{jobId:job.jobId,result:{candidates:[p],warnings:[],complete:true,progress:{accounts:1,profiles:1,pages:1}}},job.sender);
    assert.equal(memory.local.config.profiles.find(x=>x.id===missing.id).availability,'not-seen');assert.equal(memory.local.config.profiles.length,2);
    job=await startSync();await send('SCAN_RESULT',{jobId:job.jobId,result:{candidates:[p,missing],warnings:[],complete:true,progress:{accounts:1,profiles:2,pages:1}}},job.sender);
    const returned=memory.local.config.profiles.find(x=>x.id===missing.id);assert.equal(returned.availability,'observed');assert.equal(returned.showInPopup,false);
  });

  await t.test('opening without a portal requests setup without starting sync',async()=>{
    reset();memory.local.config=emptyConfig();
    const result=await send('UI_OPENED');assert.equal(result.ok,true);assert.equal(result.setupRequired,true);assert.equal(created.length,0);assert.equal(result.config.portals.length,0);
  });
  await t.test('opening with a portal reads cached profiles without starting sync',async()=>{
    reset();await send('SET_SYNC_INTERVAL',{portalId:portal,minutes:0});memory.local.config.portals[0].lastAttemptAt=Date.now();
    const result=await send('UI_OPENED');assert.equal(result.ok,true);assert.equal(result.setupRequired,false);assert.equal(result.config.portals[0].syncStatus,'idle');assert.equal(created.length,0);
    assert.equal(result.config.profiles.length,1);
  });
  await t.test('opening views never initiate sync or duplicate an explicitly requested sync',async()=>{
    reset();await send('UI_OPENED');await send('UI_OPENED');await send('GET_STATE');assert.equal(created.length,0);
    await send('SYNC_PORTAL',{portalId:portal});assert.equal(created.length,1);
    const id=memory.session.connections[portal].tabId;await completeTab(id);const job=memory.session.draft.jobId;
    await send('UI_OPENED');await send('GET_STATE');assert.equal(memory.session.draft.jobId,job);assert.equal(created.length,1);
  });
  await t.test('opening while sign-in is pending keeps its existing tab and saved profiles',async()=>{
    reset();await send('SYNC_PORTAL',{portalId:portal});const id=memory.session.connections[portal].tabId;await completeTab(id,'https://login.microsoftonline.com/signin');
    const focusedBefore=focused.length,result=await send('UI_OPENED');assert.equal(result.config.portals[0].syncStatus,'sign-in-required');assert.equal(created.length,1);assert.equal(focused.length,focusedBefore);assert.equal(result.config.profiles.length,1);
  });
  await t.test('opening does not request missing portal access; explicit sync reports it',async()=>{
    reset();granted=false;const result=await send('UI_OPENED');assert.equal(result.ok,true);assert.equal(result.setupRequired,false);assert.equal(result.config.portals[0].syncStatus,'idle');assert.equal(result.syncError,undefined);assert.equal(result.config.profiles.length,1);assert.equal(created.length,0);
    assert.equal((await send('SYNC_PORTAL',{portalId:portal})).ok,false);assert.equal(memory.local.config.portals[0].syncStatus,'permission-required');
  });

});
