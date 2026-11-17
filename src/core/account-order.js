import {groupProfilesByAccount,searchProfiles} from './model.js';
export const accountKey = profile => JSON.stringify([profile.portalId,profile.accountId]);
export function sortAccounts(groups,config) {
  const ranks=new Map((config.ui.accountOrder||[]).map((key,i)=>[key,i]));
  return [...groups].sort((a,b)=>(ranks.get(a.key)??Number.MAX_SAFE_INTEGER)-(ranks.get(b.key)??Number.MAX_SAFE_INTEGER));
}
export function moveAccount(config,{sourceKey,targetKey,position}) {
  const groups=sortAccounts(groupProfilesByAccount(searchProfiles(config.profiles)),config);
  const source=groups.find(g=>g.key===sourceKey),target=groups.find(g=>g.key===targetKey);
  if(!source||!target||!['before','after'].includes(position)||sourceKey===targetKey)throw new Error('Choose two different saved accounts to reorder.');
  const order=groups.map(g=>g.key).filter(key=>key!==sourceKey),index=order.indexOf(targetKey);
  order.splice(index+(position==='after'?1:0),0,sourceKey);
  return {...config,ui:{...config.ui,accountOrder:order}};
}
