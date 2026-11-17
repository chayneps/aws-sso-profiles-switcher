import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyConfig,normalizePortal,sanitizeConfig,sanitizeProfile,mergeCandidates,searchProfiles,popupProfiles} from '../src/core/model.js';
import {buildShortcut,parseRoleLink,isConsoleUrl} from '../src/core/urls.js';
import {parseJSON,parseINI,exportJSON} from '../src/core/imports.js';
import {permissionSetFromRole,resolveIdentity} from '../src/core/identity.js';
const portal='https://example.awsapps.com/start/';
const profile=(overrides={})=>sanitizeProfile({portalId:portal,accountId:'111122223333',accountName:'Development',permissionSet:'Dev_Lower',...overrides});
const config=(profiles=[])=>({...emptyConfig(),portals:[{id:portal,baseUrl:portal,label:'Work'}],profiles});
test('normalizes AWS portal routes and documented dual-stack root URLs',()=>{
  assert.equal(normalizePortal(`${portal}#/?tab=accounts`),portal);
  assert.equal(normalizePortal('https://ssoins-1234567890abcdef.portal.us-east-1.app.aws/#/?tab=accounts'),'https://ssoins-1234567890abcdef.portal.us-east-1.app.aws/');
});
test('rejects unrelated origins, lookalike suffixes, credentials and unsupported schemes',()=>{
  for(const url of ['http://example.awsapps.com/start','https://example.awsapps.com.attacker.test/start','https://example.com/start','https://user:secret@example.awsapps.com/start','https://example.awsapps.com:8443/start','javascript:alert(1)','https://example.awsapps.com/other'])assert.throws(()=>normalizePortal(url));
});
test('profile validation excludes credential and email fields',()=>{
  const p=profile({accessToken:'secret',email:'private@example.test',password:'secret'});
  assert.equal(p.accessToken,undefined);assert.equal(p.email,undefined);assert.equal(p.password,undefined);
  assert.throws(()=>profile({accountId:'123'}));assert.throws(()=>profile({color:'red;display:none'}));assert.throws(()=>profile({theme:'surprise'}));assert.throws(()=>profile({region:'us-gov-west-1'}));
});
test('same account with different roles retains separate stable IDs',()=>assert.notEqual(profile().id,profile({permissionSet:'ReadOnly'}).id));
test('existing configuration migrates to automatic sync and visible popup profiles',()=>{
  const c=sanitizeConfig(config([profile()]));assert.equal(c.portals[0].syncIntervalMinutes,30);assert.equal(c.profiles[0].showInPopup,true);
  const hidden=profile({showInPopup:false}),stale=profile({permissionSet:'ReadOnly',availability:'not-seen'});
  assert.deepEqual(popupProfiles([hidden,stale]),[]);
  const merged=mergeCandidates(config([hidden]),[profile()],{portalId:portal,complete:true});
  assert.equal(merged.profiles[0].showInPopup,false);assert.equal(parseJSON(exportJSON(merged)).config.profiles[0].showInPopup,false);
});
test('shortcut encoding keeps account, permission set and region in separate fields',()=>{
  const p=profile({permissionSet:'Dev+Audit,Read',region:'ca-west-1'}),url=new URL(buildShortcut(p));
  const query=new URLSearchParams(url.hash.slice(url.hash.indexOf('?')+1));
  assert.equal(url.origin,'https://example.awsapps.com');assert.equal(query.get('role_name'),p.permissionSet);assert.equal(query.get('account_id'),p.accountId);assert.equal(new URL(query.get('destination')).searchParams.get('region'),'ca-west-1');
});
test('discovery accepts only same-portal role routes with unique parameters',()=>{
  const href='#/console?account_id=111122223333&role_name=Dev_Lower';
  assert.deepEqual(parseRoleLink(href,portal),{accountId:'111122223333',permissionSet:'Dev_Lower'});
  for(const value of [href+'&role_name=Admin','https://attacker.test/start/'+href,'#/other?account_id=111122223333&role_name=Admin',href.replace('111122223333','12')])assert.equal(parseRoleLink(value,portal),null);
});
test('console domains include native multi-session hosts but exclude lookalikes',()=>{
  assert.equal(isConsoleUrl('https://111122223333-abcdef12.us-east-1.console.aws.amazon.com/ec2'),true);
  assert.equal(isConsoleUrl('https://console.aws.amazon.com.attacker.test/'),false);
});
test('portal reimport preserves customization and updates observed names',()=>{
  const old=profile({label:'My dev',theme:'dark',showInPopup:false,color:'#bb3311'});
  const merged=mergeCandidates(config([old]),[profile({accountName:'Renamed account'})],{portalId:portal,complete:true,now:50});
  assert.equal(merged.profiles[0].accountName,'Renamed account');assert.equal(merged.profiles[0].label,'My dev');assert.equal(merged.profiles[0].theme,'dark');assert.equal(merged.profiles[0].showInPopup,false);assert.equal(merged.profiles[0].lastSeenAt,50);
});
test('selective complete import uses the entire discovered inventory for absence tracking',()=>{
  const a=profile(),b=profile({permissionSet:'ReadOnly'}),missing=profile({permissionSet:'Old'});
  const merged=mergeCandidates(config([a,b,missing]),[a],{portalId:portal,complete:true,observedIds:[a.id,b.id]});
  assert.equal(merged.profiles.find(p=>p.id===b.id).availability,'observed');assert.equal(merged.profiles.find(p=>p.id===missing.id).availability,'not-seen');assert.equal(merged.profiles.length,3);
});
test('partial import does not mark unseen profiles missing or delete them',()=>{
  const a=profile(),b=profile({permissionSet:'ReadOnly',availability:'observed'});
  const merged=mergeCandidates(config([a,b]),[a],{portalId:portal,complete:false});assert.equal(merged.profiles.length,2);assert.equal(merged.profiles[1].availability,'observed');
});
test('modern SSO INI references and legacy inline fields import without secrets',()=>{
  const modern=parseINI(`[sso-session work]\nsso_start_url = ${portal}\nsso_region = us-east-1\n[profile dev]\nsso_session = work\nsso_account_id = 111122223333\nsso_role_name = Dev_Lower\naws_secret_access_key = DO_NOT_KEEP\nregion = us-east-2`);
  assert.equal(modern.config.profiles[0].permissionSet,'Dev_Lower');assert.ok(!exportJSON(modern.config).includes('DO_NOT_KEEP'));
  const legacy=parseINI(`[profile legacy]\nsso_start_url=${portal}\nsso_account_id=111122223333\nsso_role_name=ReadOnly`);assert.equal(legacy.config.profiles[0].label,'legacy');
});
test('INI explains non-SSO assume-role entries instead of inventing assignments',()=>assert.throws(()=>parseINI('[legacy]\nrole_arn=arn:aws:iam::111122223333:role/Admin',portal),/cannot be converted/));
test('JSON export roundtrips configuration and rejects unsupported schema',()=>{
  const expected=sanitizeConfig(config([profile()]));assert.deepEqual(parseJSON(exportJSON(expected)).config,expected);assert.throws(()=>parseJSON('{"version":99}'),/Unsupported/);
});
test('search matches multiple words across name, account and role and sorts roles alphabetically despite legacy flags',()=>{
  const a=profile(),b=profile({permissionSet:'ReadOnly',favorite:true});assert.equal(searchProfiles([a,b],'development read')[0].id,b.id);assert.equal(searchProfiles([a,b])[0].id,a.id);assert.equal(searchProfiles([a,b],'missing').length,0);
});
test('legacy pin fields are ignored while manual account order and profile preferences survive import and sync',()=>{
  const legacy=profile({favorite:true,pinnedAt:100,theme:'dark',color:'#123456'}),other=profile({accountId:'444455556666',accountName:'Production',permissionSet:'ReadOnly'});
  assert.equal(legacy.favorite,undefined);assert.equal(legacy.pinnedAt,undefined);
  const c=config([legacy,other]);c.ui.accountOrder=[JSON.stringify([other.portalId,other.accountId]),JSON.stringify([legacy.portalId,legacy.accountId])];
  const merged=mergeCandidates(c,[legacy,other],{portalId:portal,complete:true});const restored=parseJSON(exportJSON(merged)).config;
  assert.deepEqual(restored.ui.accountOrder,c.ui.accountOrder);assert.equal(restored.profiles[0].theme,'dark');assert.equal(restored.profiles[0].color,'#123456');
  assert.equal(restored.profiles[0].favorite,undefined);
});
test('identity matching preserves underscores, distinguishes roles and refuses ambiguous portals',()=>{
  assert.equal(permissionSetFromRole('AWSReservedSSO_Dev_Team_Lower_0123456789abcdef/person@example.test @ alias'),'Dev_Team_Lower');
  assert.equal(permissionSetFromRole('Dev_Lower'),null);
  const a=profile(),b=profile({permissionSet:'ReadOnly'});
  assert.equal(resolveIdentity({accountId:a.accountId,permissionSet:b.permissionSet},[a,b]).id,b.id);
  assert.equal(resolveIdentity({accountId:a.accountId,permissionSet:a.permissionSet},[a,profile({portalId:'https://other.awsapps.com/start/'})]),null);
});
