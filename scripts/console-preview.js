import {createAppearance} from '../src/core/appearance.js';
const profiles = {
  developer:{accountId:'111122223333',accountName:'Development',permissionSet:'Developer',theme:'dark',color:'#ff9900'},
  readonly:{accountId:'111122223333',accountName:'Development',permissionSet:'ReadOnly',theme:'dark',color:'#123456'}
};
const adapter=createAppearance(document), byId=id=>document.getElementById(id);
function showIcon(){byId('preview-tab-icon').src=document.querySelector('link[rel~="icon"]').href;byId('preview-tab-label').textContent=`${profiles[byId('preview-profile').value].permissionSet} · Console Home`;}
function apply() {
  const profile=profiles[byId('preview-profile').value];
  byId('preview-color').value=profile.color;
  byId('account-label').textContent=`${profile.accountName} (${profile.accountId})`;
  byId('role-label').textContent=`${profile.permissionSet} / sample-user`;
  byId('nav-usernameMenu').title=`AWSReservedSSO_${profile.permissionSet}_0123456789abcdef/sample-user`;
  adapter.apply(profile);showIcon();byId('preview-state').textContent='Profile color applied to tab icon, account menu and header.';
}
byId('preview-profile').addEventListener('change',apply);
byId('preview-color').addEventListener('input',event=>{profiles[byId('preview-profile').value].color=event.target.value;apply();});
byId('preview-clear').addEventListener('click',()=>{adapter.clear();showIcon();byId('preview-state').textContent='Profile cleared. Original tab icon and account color restored.';});
byId('preview-apply').addEventListener('click',apply);
byId('preview-rebuild').addEventListener('click',()=>{
  const old=byId('nav-usernameMenu'),next=document.createElement('button');next.id=old.id;next.type='button';
  const label=document.createElement('div');label.className='native-account-color';const span=document.createElement('span');span.id='account-label';label.append(span);
  const role=document.createElement('div');role.className='role';role.id='role-label';next.append(label,role);old.replaceWith(next);
  if(!adapter.isCurrent())apply();
});
apply();
