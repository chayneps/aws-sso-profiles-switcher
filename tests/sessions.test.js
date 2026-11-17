import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readConsoleSessions,prepareConsoleSession} from '../src/core/console-sessions.js';
import {getSessions,closeSession} from '../src/background/sessions.js';
import {createLauncher} from '../src/background/launch.js';
import {emptyConfig,sanitizeProfile} from '../src/core/model.js';
const portalId='https://example.awsapps.com/start/';
const profile=sanitizeProfile({portalId,accountId:'111122223333',permissionSet:'Developer'});
const config={...emptyConfig(),profiles:[profile]};
const item=(key='111122223333-abc',permissionSet='Developer')=>({key,accountId:key.slice(0,12),permissionSet,url:`https://${key}.us-east-1.console.aws.amazon.com/console/home`});
const first=item();
function fixture(extra='') {
  const dom=new JSDOM(`<header id="awsc-nav-header"><li><button id="nav-usernameMenu" title="AWSReservedSSO_Developer_0123456789abcdef/user" aria-controls="menu--account" aria-expanded="false">111122223333</button><div id="menu--account">${extra}</div></li></header>`,{url:first.url});
  const doc=dom.window.document;
  dom.window.HTMLElement.prototype.getClientRects=()=>[{}];
  return dom;
}
test('native registry reads closed-tab identities and deduplicates session keys across regions',()=>{
  const dom=fixture('<h3>1 other active sessions</h3><a data-testid="awsc-account-menu-other-session-tile_AWSReservedSSO_ReadOnly_0123456789abcdef/user" href="https://444455556666-def.us-east-2.console.aws.amazon.com/console/home">Other</a>');
  const result=readConsoleSessions(dom.window.document,first.url);
  assert.equal(result.complete,true);assert.equal(result.items.length,2);assert.equal(result.items[1].permissionSet,'ReadOnly');
  dom.window.document.querySelector('a').href='https://evil.example/';
  assert.equal(readConsoleSessions(dom.window.document,first.url).complete,false);dom.window.close();
});
function chromeFixture(registry,options={}) {
  let tabs=[{id:1,windowId:1,status:'complete',lastAccessed:10,url:first.url},...(options.tabs||[])],created=[],prepared=[],focused=[],removed=[],navigated=[],reloaded=[],freshReads=0,signedKey,stored={launches:{}};
  const live=()=>options.confirm===false?registry:registry.filter(i=>i.key!==signedKey);
  globalThis.chrome={tabs:{query:async()=>tabs,get:async id=>{const tab=tabs.find(t=>t.id===id);if(!tab)throw Error('Missing');return tab;},create:async value=>{
    const url=signedKey && value.url.includes(signedKey) && live().length===0?'https://signin.aws.amazon.com/signin':value.url;
    const tab={id:10+created.length,windowId:1,status:'complete',...value,url};
    if(signedKey && options.verifierUnreadable)delete tab.url;
    created.push({...value,id:tab.id});tabs.push(tab);return tab;
  },update:async(id,props)=>{
    const tab=tabs.find(t=>t.id===id);if(props.active)focused.push(id);
    if(props.url){navigated.push({id,url:props.url});signedKey=new URL(props.url).pathname.split('/')[2];Object.assign(tab,props,{url:'https://signin.aws.amazon.com/signin'});}return tab;
  },remove:async id=>{removed.push(id);tabs=tabs.filter(t=>t.id!==id);},reload:async id=>{reloaded.push(id);},group:async()=>1},windows:{update:async()=>{focused.push('window');}},tabGroups:{query:async()=>[],update:async()=>{}},storage:{session:{get:async()=>structuredClone(stored),set:async value=>{Object.assign(stored,structuredClone(value));}}},scripting:{executeScript:async ({func,target,args})=>{
    if(func.name==='readConsoleSessions'){
      const fresh=target.tabId>=10,items=fresh?live():registry,tab=tabs.find(t=>t.id===target.tabId);
      if(fresh)freshReads++;
      return[{result:{items,current:items.find(i=>tab.url.includes(i.key))||items[0],complete:fresh?options.verifyComplete!==false&&freshReads>(options.verifyDelayReads||0):true,loadedAt:fresh?Date.now():options.loadedAt||1}}];
    }
    if(func.name==='readConsoleIdentity')return[{result:options.identity||null}];
    if(func.name==='prepareConsoleSession'){
      prepared.push({tab:target.tabId,...args[0],...args[1]});
      if(options.prepareThrows)throw new Error('Console probe failed');
      return[{result:args[1].needLogout?(options.action || {ready:true,logoutUrl:`https://us-east-1.signin.aws.amazon.com/sessions/${args[0].key}/v1/logout`}):{ready:true}}];
    }
    return [{result:{status:'enabled'}}];
  }}};
  return {created,prepared,focused,removed,navigated,reloaded,stored};
}
test('inventory counts native sessions once, including hidden/unconfigured profiles and closed tabs',async()=>{
  chromeFixture([first,item('444455556666-def','ReadOnly')],{tabs:[{id:2,url:first.url.replace('us-east-1','us-west-2')}]});
  const result=await getSessions(config);assert.equal(result.items.length,2);assert.deepEqual(result.items[0].tabIds,[1,2]);assert.equal(result.items[0].profileId,profile.id);assert.equal(result.items[1].profileId,undefined);
});
test('full capacity blocks new federation but reuses an existing native session with no tab',async()=>{
  const full=[first,...Array.from({length:4},(_,i)=>item(`44445555666${i}-def`,'ReadOnly'))];
  const f=chromeFixture(full);const launcher=createLauncher({session:async()=>({})});
  const other=sanitizeProfile({...profile,accountId:'999988887777'});
  assert.equal((await launcher.launch(other,config)).sessionFull,true);assert.equal(f.created.length,0);
  const saved=sanitizeProfile({...profile,accountId:full[1].accountId,permissionSet:'ReadOnly'});
  const c={...config,profiles:[profile,saved]};const result=await launcher.launch(saved,c);
  assert.equal(result.reusedSession,true);assert.equal(f.created[0].url,full[1].url);assert.ok(!f.created[0].url.includes('role_name='));
});
test('existing exact tab still focuses at capacity; pending sign-ins reserve remaining slots',async()=>{
  const full=[first,...Array.from({length:4},(_,i)=>item(`44445555666${i}-def`,'ReadOnly'))];
  const f=chromeFixture(full,{identity:{accountId:profile.accountId,permissionSet:profile.permissionSet}});
  assert.equal((await createLauncher({session:async()=>({})}).launch(profile,config)).focused,true);assert.deepEqual(f.focused,[1,'window']);assert.equal(f.created.length,0);
  chromeFixture(full.slice(0,4),{tabs:[{id:2,url:portalId}]});
  const state={launches:{2:{profileId:'pending',startedAt:Date.now()}}};
  const other=sanitizeProfile({...profile,accountId:'999988887777'});
  assert.equal((await createLauncher({session:async()=>state}).launch(other,config)).sessionFull,true);
});
test('closing a closed-tab session uses only disposable inactive tabs and confirms native removal',async()=>{
  const second=item('444455556666-def','ReadOnly'),f=chromeFixture([first,second]);
  assert.equal((await closeSession(second.key,config,{})).confirmed,true);
  assert.equal(f.created[0].url,second.url);assert.ok(f.created.every(t=>t.active===false));
  assert.deepEqual(f.prepared[0],{tab:10,key:second.key,permissionSet:'ReadOnly',needLogout:true});
  assert.deepEqual(f.navigated,[{id:10,url:`https://us-east-1.signin.aws.amazon.com/sessions/${second.key}/v1/logout`}]);
  assert.deepEqual(f.focused,[]);assert.deepEqual(f.removed,[10,11]);
  assert.ok(f.stored.closedSessions[second.key]);
  assert.deepEqual((await getSessions(config,f.stored)).items.map(i=>i.key),[first.key]);
  await assert.rejects(closeSession('missing',config,{}),/no longer available/);
});
test('failure stays in popup, cleans temporary tabs, and cannot navigate to sign-out-all',async()=>{
  for(const action of [{reason:'Session identity changed.'},{ready:true,logoutUrl:`https://us-east-1.signin.aws.amazon.com/sessions/${first.key}/v1/logoutAll`},{ready:true,logoutUrl:'https://evil.example/logout'}]){
    const f=chromeFixture([first],{action});await assert.rejects(closeSession(first.key,config,{}),/identity changed|verified sign-out/);
    assert.deepEqual(f.navigated,[]);assert.deepEqual(f.focused,[]);assert.deepEqual(f.removed,[10]);assert.equal(f.stored.closedSessions,undefined);
  }
  const f=chromeFixture([first],{prepareThrows:true});await assert.rejects(closeSession(first.key,config,{}),/probe failed/);assert.deepEqual(f.removed,[10]);
});
test('unconfirmed sign-out keeps the session and its capacity reservation',async()=>{
  const second=item('444455556666-def','ReadOnly');
  for(const options of [{confirm:false},{verifyComplete:false}]){
    const f=chromeFixture([first,second],options);
    assert.deepEqual(await closeSession(second.key,config,{}, {attempts:2,delayMs:0}),{signOutRequested:true,confirmed:false});
    assert.equal(f.stored.closedSessions,undefined);assert.equal((await getSessions(config)).items.length,2);assert.deepEqual(f.focused,[]);assert.deepEqual(f.removed,[10,11]);
  }
});
test('last session is confirmed only when a new request for its console reaches AWS sign-in',async()=>{
  const f=chromeFixture([first]);assert.equal((await closeSession(first.key,config,{})).confirmed,true);
  assert.equal((await getSessions(config,f.stored)).items.length,0);assert.deepEqual(f.removed,[10,11]);
  // Without sign-in host permissions Chrome may omit URL metadata entirely.
  const unreadable=chromeFixture([first],{verifierUnreadable:true});
  assert.equal((await closeSession(first.key,config,{})).confirmed,false);assert.equal(unreadable.stored.closedSessions,undefined);
});
test('verification waits for the native registry fetch without reloading its page mid-request',async()=>{
  const second=item('444455556666-def','ReadOnly'),f=chromeFixture([first,second],{verifyDelayReads:2});
  assert.equal((await closeSession(second.key,config,{}, {attempts:4,delayMs:0})).confirmed,true);
  assert.deepEqual(f.reloaded,[]);
});
test('confirmed closure suppresses old DOM observations while a newly loaded session remains usable',async()=>{
  const state={closedSessions:{[first.key]:100}};
  chromeFixture([first],{loadedAt:90});assert.equal((await getSessions(config,state)).items.length,0);
  chromeFixture([first],{loadedAt:110});assert.equal((await getSessions(config,state)).items.length,1);
  const f=chromeFixture([first],{loadedAt:90,identity:{accountId:profile.accountId,permissionSet:profile.permissionSet}});
  assert.equal((await createLauncher({session:async()=>state}).launch(profile,config)).focused,false);
  assert.deepEqual(f.focused,[]);assert.match(f.created[0].url,/role_name=Developer/);
});
function useDOM(t,dom){
  globalThis.document=dom.window.document;globalThis.location=dom.window.location;globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
  t.after(()=>{dom.window.close();delete globalThis.document;delete globalThis.location;delete globalThis.getComputedStyle;});
}
const fast={attempts:12,delayMs:0};
test('adapter discovers the native exact link through a portalled submenu without submitting sign-out',async t=>{
  const dom=fixture('<div role="group"><button>Sign out of 5 sessions</button><button aria-expanded="false" aria-haspopup="true">▼</button></div>');
  useDOM(t,dom);
  let all=0,current=0;
  document.querySelector('[role=group] button').onclick=()=>all++;
  document.querySelector('#nav-usernameMenu').onclick=e=>e.currentTarget.setAttribute('aria-expanded','true');
  document.querySelector('[aria-haspopup]').onclick=e=>{e.currentTarget.setAttribute('aria-expanded','true');const b=document.createElement('a');b.setAttribute('role','menuitem');b.href=`https://us-east-1.signin.aws.amazon.com/sessions/${first.key}/v1/logout`;b.textContent='Sign out of current session';b.onclick=()=>current++;document.body.append(b);};
  assert.match((await prepareConsoleSession({key:'wrong',permissionSet:'Developer'},fast)).reason,/identity changed/);assert.equal(all,0);
  assert.equal((await prepareConsoleSession(first,fast)).logoutUrl,`https://us-east-1.signin.aws.amazon.com/sessions/${first.key}/v1/logout`);assert.equal(current,0);assert.equal(all,0);
});
test('native link discovery rejects logoutAll, wrong identities, and unscoped text-only actions',async t=>{
  const dom=fixture(`<a id="all" href="https://us-east-1.signin.aws.amazon.com/sessions/${first.key}/v1/logoutAll">Sign out of all sessions</a><a id="one" href="https://us-east-1.signin.aws.amazon.com/sessions/${first.key}/v1/logout">Sign out</a>`);
  useDOM(t,dom);
  let all=0,one=0;document.querySelector('#all').onclick=e=>{e.preventDefault();all++;};document.querySelector('#one').onclick=e=>{e.preventDefault();one++;};
  assert.equal((await prepareConsoleSession(first,fast)).logoutUrl,document.querySelector('#one').href);assert.equal(one,0);assert.equal(all,0);
  document.querySelector('#one').remove();
  const unsafe=['https://evil.example/logout',`https://us-east-1.signin.aws.amazon.com/sessions/444455556666-def/v1/logout`,`https://us-east-1.signin.aws.amazon.com/sessions/${first.key}/v1/logout?all=true`];
  for(const href of unsafe){const a=document.createElement('a');a.href=href;a.role='menuitem';a.textContent='Sign out of current session';document.body.append(a);}
  assert.equal((await prepareConsoleSession(first,fast)).logoutUrl,undefined);
  assert.match((await prepareConsoleSession({...first,permissionSet:'OtherRole'},fast)).reason,/identity changed/);
});
test('adapter waits for late header mounting, reacquires replaced nodes, and accepts singular session count',async t=>{
  const dom=fixture();useDOM(t,dom);document.querySelector('#nav-usernameMenu').remove();document.querySelector('#menu--account').remove();
  setTimeout(()=>{
    const menu=document.createElement('button');menu.id='nav-usernameMenu';menu.title='AWSReservedSSO_Developer_0123456789abcdef/user';menu.setAttribute('aria-controls','menu--account');menu.setAttribute('aria-expanded','false');document.querySelector('li').append(menu);
    menu.onclick=()=>{
      const replacement=menu.cloneNode(true);replacement.setAttribute('aria-expanded','true');menu.replaceWith(replacement);
      setTimeout(()=>{const panel=document.createElement('div');panel.id='menu--account';panel.innerHTML='<div role="group"><button>Sign out of 1 session</button><button aria-expanded="false" aria-haspopup="true">▼</button></div>';document.querySelector('li').append(panel);panel.querySelector('[aria-haspopup]').onclick=e=>{e.currentTarget.setAttribute('aria-expanded','true');const a=document.createElement('a');a.role='menuitem';a.href=`https://us-east-1.signin.aws.amazon.com/sessions/${first.key}/v1/logout`;a.textContent='Sign out of current session';document.body.append(a);};},0);
    };
  },0);
  assert.ok((await prepareConsoleSession(first,fast)).logoutUrl);
});
