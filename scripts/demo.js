import {moveAccount} from '../src/core/account-order.js';
import {emptyConfig,sanitizeProfile,sanitizeConfig,normalizePortal,mergeCandidates} from '../src/core/model.js';
globalThis.__SSO_DEMO__=true;
const portalId='https://example.awsapps.com/start/';
const samples=[['Development','111122223333','Developer','light','#3a8b72'],['Production','444455556666','ReadOnly','dark','#d46f4a'],['Development','111122223333','ReadOnly','system','#7583bf'],['Staging','777788889999','Developer','light','#bf923a']].map(([accountName,accountId,permissionSet,theme,color],index)=>sanitizeProfile({portalId,accountName,accountId,permissionSet,theme,color,region:'us-east-1'}));
// Separate UI fixtures let us review first-run layout without changing sample profiles.
const fixture = new URLSearchParams(location.search).get('fixture');
// Explicit sample states for prerequisite UI review; never a real AWS check.
let multiSession = {status: new URLSearchParams(location.search).get('multi') || 'enabled', source:'demo'};
const nextMulti = new URLSearchParams(location.search).get('multi-next');
const emptyFixture = ['empty', 'setup'].includes(fixture);
const storageKey = emptyFixture ? `sso-demo-${fixture}-config` : 'sso-demo-config';
let saved;
try{saved=JSON.parse(localStorage.getItem(storageKey));}catch{}
let config=saved?sanitizeConfig(saved):emptyFixture?emptyConfig():{...emptyConfig(),portals:[{id:portalId,baseUrl:portalId,label:'Example organization'}],profiles:samples};
// A larger, uneven sample catalog exposes account-column packing regressions.
if(fixture==='layout') config={...emptyConfig(),portals:[{id:portalId,baseUrl:portalId,label:'Example organization'}],profiles:[...samples,...Array.from({length:8},(_,i)=>{
  const base={portalId,accountId:String(222200000000+i),accountName:['Development Integration with a Full Account Name','QA Automation','Production Integrations','Shared Services','Customer Sandbox','Platform Operations','Analytics Development','Security Audit'][i],theme:'system',color:i%2?'#d46f4a':'#7583bf'};
  return [sanitizeProfile({...base,permissionSet:'Developer'}),...(i%3===0?[sanitizeProfile({...base,permissionSet:'ReadOnly'})]:[])];
}).flat()]};
const portalState = new URLSearchParams(location.search).get('portal-status');
if (['synced','sign-in-required','permission-required','error','partial'].includes(portalState) && config.portals[0]) config.portals[0].syncStatus = portalState;
const portalAccess = Object.fromEntries(config.portals.map(p=>[p.id,new URLSearchParams(location.search).get('portal-access')||'unknown']));
for(const p of config.portals)if(portalAccess[p.id]==='ready'&&p.syncStatus==='sign-in-required'){p.syncStatus='idle';p.syncMessage='';}
const demoFull=new URLSearchParams(location.search).get('sessions')==='full';
let sessionItems=(demoFull?samples.slice(0,3):[samples[0],samples[2]]).map((p,i)=>({key:p.accountId+'-demo'+i,accountId:p.accountId,permissionSet:p.permissionSet,profileId:p.id,url:'',tabIds:[]}));
if(demoFull)sessionItems.push(...['999900001111','999900002222'].map(accountId=>({key:accountId+'-demo',accountId,permissionSet:'Admin',tabIds:[]}))); 
const sessionState=()=>({items:structuredClone(sessionItems),limit:5,complete:true,pendingProfileIds:[]});
let draft=null;const listeners=new Set();let importTimer;
window.addEventListener('storage', event => {
  if (event.key !== storageKey || !event.newValue) return;
  try { config=sanitizeConfig(JSON.parse(event.newValue)); for(const listener of listeners)listener({},'local'); } catch { /* Keep the last valid preview catalog. */ }
});
function changed(){config=sanitizeConfig(config);localStorage.setItem(storageKey,JSON.stringify(config));for(const listener of listeners)listener({},'local');}
async function handle(m){
  switch(m.type){
    case 'UI_OPENED':{
      return{config:structuredClone(config),draft:structuredClone(draft),observed:[],sessions:sessionState(),portalAccess,multiSession:{...multiSession},setupRequired:config.portals.length===0};
    }
    case 'GET_STATE':return{config:structuredClone(config),draft:structuredClone(draft),observed:[],sessions:sessionState(),portalAccess,multiSession:{...multiSession}};
    case 'SET_TAB_GROUP':config.ui.tabGroupName=m.name;break;
    case 'CHECK_MULTI_SESSION':{
      if(['enabled','disabled','unknown'].includes(nextMulti))multiSession={status:nextMulti,source:'demo'};
      return{multiSession:{...multiSession},sessions:sessionState()};
    }
    case 'OPEN_MULTI_SESSION_SETUP':return{};
    case 'SAVE_PORTAL':{const id=normalizePortal(m.url);config.portals=config.portals.filter(p=>p.id!==id);config.portals.push({id,baseUrl:id,label:m.label});break;}
    case 'SAVE_PROFILE':{const p=sanitizeProfile(m.profile,config.portals);config.profiles=config.profiles.filter(x=>x.id!==p.id&&x.id!==m.previousId);config.profiles.push(p);break;}
    case 'DELETE_PROFILE':config.profiles=config.profiles.filter(p=>p.id!==m.id);break;
    case 'IMPORT_CONFIG':{const input=sanitizeConfig(m.config);config.portals=[...new Map([...config.portals,...input.portals].map(p=>[p.id,p])).values()];config.profiles=[...new Map([...config.profiles,...input.profiles].map(p=>[p.id,p])).values()];config.ui.customColors=config.ui.customColors.map((color,i)=>input.ui.customColors[i]||color);config.ui.accountOrder=[...new Set([...input.ui.accountOrder,...config.ui.accountOrder])];break;}
    case 'OPEN_PORTAL':return{};
    case 'CLOSE_SESSION':{
      const outcome=new URLSearchParams(location.search).get('close');
      if(outcome==='error')throw new Error('AWS did not expose a verified sign-out link for this session. Use its account menu to sign out.');
      if(outcome==='pending')return{signOutRequested:true,confirmed:false};
      sessionItems=sessionItems.filter(i=>i.key!==m.key);return{signOutRequested:true,confirmed:true};
    }
    case 'LAUNCH':{
      if(sessionItems.some(i=>i.profileId===m.id))return{focused:true};
      if(sessionItems.length>=5)return{sessionFull:true,sessions:sessionState()};
      return multiSession.status!=='disabled'?{focused:false}:{launchBlocked:true,multiSession:{...multiSession}};
    }
    case 'SYNC_PORTAL':case 'START_SCAN':{
      const portal=config.portals.find(p=>p.id===m.portalId);if(!portal)throw new Error('Connect a portal first.');portal.syncStatus='syncing';portal.lastAttemptAt=Date.now();
      draft={jobId:crypto.randomUUID(),portalId:m.portalId,status:'scanning',complete:false,candidates:[],warnings:[],progress:{accounts:0,profiles:0,pages:0}};
      importTimer=setTimeout(()=>{draft={...draft,status:'saved',complete:true,candidates:samples.map(p=>sanitizeProfile({...p,portalId:m.portalId})),progress:{accounts:3,profiles:4,pages:1}};config=mergeCandidates(config,draft.candidates,{portalId:m.portalId,complete:true});const portal=config.portals.find(p=>p.id===m.portalId);portal.syncStatus='synced';portal.syncMessage='4 profiles synchronised automatically.';changed();},1200);break;
    }
    case 'CANCEL_SCAN':{clearTimeout(importTimer);draft={...draft,status:'cancelled',complete:false};const p=config.portals.find(p=>p.id===draft.portalId);if(p){p.syncStatus='partial';p.syncMessage='Synchronisation cancelled. Previous profiles kept.';}break;}
    case 'SET_VISIBILITY':{const p=config.profiles.find(p=>p.id===m.id);p.showInPopup=m.show;break;}
    case 'REORDER_ACCOUNT':config=moveAccount(config,m);break;
    case 'SET_CUSTOM_COLOR':config.ui.customColors[m.index]=m.color;break;
    case 'SET_COLOR':{const p=config.profiles.find(p=>p.id===m.id);p.color=m.color;break;}
    case 'SET_SYNC_INTERVAL':{const p=config.portals.find(p=>p.id===m.portalId);p.syncIntervalMinutes=m.minutes;break;}
    default:throw new Error('Unknown demo action.');
  }
  changed();return{};
}
globalThis.chrome={runtime:{id:'demo',sendMessage:async m=>{try{return{ok:true,...await handle(m)};}catch(e){return{ok:false,error:e.message};}},openOptionsPage:()=>window.open('/options.html'+location.search,'_blank')},permissions:{request:async()=>true,contains:async()=>true},storage:{onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
