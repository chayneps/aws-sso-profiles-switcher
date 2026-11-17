import {isConsoleUrl} from '../core/urls.js';
import {resolveIdentity} from '../core/identity.js';
import {readConsoleSessions,prepareConsoleSession} from '../core/console-sessions.js';
export const SESSION_LIMIT = 5;
const patterns = ['https://*.console.aws.amazon.com/*','https://console.aws.amazon.com/*'];
export async function getSessions(config, state = {}) {
  const tabs = (await chrome.tabs.query({url:patterns})).filter(t=>isConsoleUrl(t.url));
  const probes = await Promise.all(tabs.map(async tab=>{
    try { return {tab,...(await chrome.scripting.executeScript({target:{tabId:tab.id},func:readConsoleSessions}))[0]?.result}; }
    catch { return {tab,items:[],complete:false}; }
  }));
  // A full native registry includes sessions whose tabs were closed. Prefer the
  // newest console's registry; never count tabs as separate logins. Focusing an
  // older page does not make its cached AWS registry newer.
  const registry = probes.filter(p=>p.complete).sort((a,b)=>(b.loadedAt||0)-(a.loadedAt||0) || (b.tab.lastAccessed||0)-(a.tab.lastAccessed||0))[0];
  // A page loaded before a confirmed sign-out can retain an old AWS registry.
  // A newly loaded page may establish a new session, even if AWS reuses its key.
  const currentItems = probe => (probe.items || []).filter(item=>!(state.closedSessions?.[item.key] >= (probe.loadedAt || 0)));
  const entries = registry ? currentItems(registry) : probes.flatMap(currentItems);
  const items = [...new Map(entries.map(i=>[i.key,{...i}])).values()].map(item=>{
    const profile=resolveIdentity(item,config.profiles);
    return {...item,profileId:profile?.id,tabIds:tabs.filter(t=>new URL(t.url).hostname.split('.')[0]===item.key).map(t=>t.id)};
  });
  const pending = [];
  for(const [id,launch] of Object.entries(state.launches||{})) {
    if(Date.now()-launch.startedAt>600000 || items.some(i=>i.profileId===launch.profileId)) continue;
    const tab=await chrome.tabs.get(Number(id)).catch(()=>null);
    // Only unresolved SSO requests reserve capacity, not expired console tabs.
    if(tab && (!isConsoleUrl(tab.url) || tab.status==='loading') && !pending.includes(launch.profileId)) pending.push(launch.profileId);
  }
  return {items,limit:SESSION_LIMIT,complete:!!registry,pendingProfileIds:pending};
}
function isSignInUrl(value) {
  try { const u=new URL(value);return u.protocol==='https:' && !u.port && !u.username && !u.password && /^(?:[a-z0-9-]+\.)?signin\.aws\.amazon\.com$/.test(u.hostname); } catch { return false; }
}
function isSessionLogout(value,key) {
  try { const u=new URL(value);return isSignInUrl(value) && u.pathname===`/sessions/${key}/v1/logout` && !u.search && !u.hash; } catch { return false; }
}
export async function closeSession(key,config,state,{attempts=60,delayMs=150}={}) {
  const inventory=await getSessions(config,state), item=inventory.items.find(i=>i.key===key);
  if(!item || !item.permissionSet) throw new Error('Session is no longer available. Refresh and try again.');
  const temporary=[];
  const pause=()=>new Promise(r=>setTimeout(r,delayMs));
  const complete=async id=>{
    for(let i=0;i<attempts;i++) { const tab=await chrome.tabs.get(id);if(tab.status==='complete' && !tab.pendingUrl)return tab;await pause(); }
    throw new Error('AWS did not finish loading. Try closing the session again.');
  };
  const open=async entry=>{
    const tab=await chrome.tabs.create({url:entry.url,active:false});temporary.push(tab.id);
    return complete(tab.id);
  };
  const prepare=async(tab,entry,needLogout)=>{
    if(!isConsoleUrl(tab.url) || new URL(tab.url).hostname.split('.')[0]!==entry.key)return null;
    return (await chrome.scripting.executeScript({target:{tabId:tab.id},func:prepareConsoleSession,args:[{key:entry.key,permissionSet:entry.permissionSet},{needLogout}]}))[0]?.result;
  };
  try {
    // Never navigate or activate the user's working tabs. Discover AWS's own
    // exact link in a fresh console, then navigate only this disposable tab.
    const tab=await open(item), action=await prepare(tab,item,true);
    if(!isSessionLogout(action?.logoutUrl,item.key))throw new Error(action?.reason || 'AWS did not expose a verified sign-out link for this session. Use its account menu to sign out.');
    await chrome.tabs.update(tab.id,{url:action.logoutUrl});
    await complete(tab.id);
    // A fresh surviving console is the authority; cached user-tab menus are not.
    // For the last session, reopening its console must lead back to AWS sign-in.
    const witness=inventory.items.find(i=>i.key!==key && i.permissionSet) || item;
    let confirmed=false;
    try {
      let verifier=await open(witness);
      for(let i=0;i<3;i++) {
        if(witness.key===key && isSignInUrl(verifier.url)){confirmed=true;break;}
        const ready=await prepare(verifier,witness,false);
        if(!ready?.ready)break;
        // The shell can mount before AWS finishes loading the session list.
        // Let that request finish rather than repeatedly reloading it mid-fetch.
        let registry;
        for(let j=0;j<attempts;j++){
          registry=(await chrome.scripting.executeScript({target:{tabId:verifier.id},func:readConsoleSessions}))[0]?.result;
          if(registry?.complete)break;
          await pause();
        }
        if(registry?.complete && registry.current?.key===witness.key && registry.current.permissionSet===witness.permissionSet && !registry.items.some(i=>i.key===key)){confirmed=true;break;}
        if(!registry?.complete)break;
        if(i<2){await pause();await chrome.tabs.reload(verifier.id);verifier=await complete(verifier.id);}
      }
    } catch { /* A submitted sign-out can outlive its verification page. */ }
    if(confirmed) {
      const {launches={},closedSessions={}}=await chrome.storage.session.get(['launches','closedSessions']);
      for(const id of item.tabIds)delete launches[id];
      closedSessions[key]=Date.now();
      const bounded=Object.fromEntries(Object.entries(closedSessions).sort((a,b)=>b[1]-a[1]).slice(0,100));
      await chrome.storage.session.set({launches,closedSessions:bounded});
    }
    return {signOutRequested:true,confirmed};
  } finally {
    await Promise.allSettled(temporary.map(id=>chrome.tabs.remove(id)));
  }
}
