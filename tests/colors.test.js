import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESET_COLORS,customColors} from '../src/core/colors.js';
import {accentForeground} from '../src/core/appearance.js';
import {emptyConfig,sanitizeConfig,sanitizeProfile,mergeCandidates} from '../src/core/model.js';
import {exportJSON,parseJSON} from '../src/core/imports.js';
function luminance(hex){const channels=hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
test('four named presets have readable black/white checkmarks and console-header text',()=>{
  assert.deepEqual(PRESET_COLORS.map(p=>p.name),['Red','Yellow','Green','Blue']);assert.equal(new Set(PRESET_COLORS.map(p=>p.value)).size,4);
  for(const color of PRESET_COLORS){const a=luminance(color.value),b=luminance(accentForeground(color.value));assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);}
});
test('four custom slots migrate without recoloring profiles, and survive sync and JSON transfer',()=>{
  const portal='https://example.awsapps.com/start/',profile=sanitizeProfile({portalId:portal,accountId:'111122223333',permissionSet:'Developer',color:'#ab12ef'});
  const old={...emptyConfig(),portals:[{id:portal}],profiles:[profile],ui:{theme:'system',tabGroupName:'Work'}};
  const config=sanitizeConfig(old);assert.deepEqual(config.ui.customColors,[null,null,null,null]);assert.equal(config.profiles[0].color,'#ab12ef');
  config.ui.customColors=['#123456',null,'#aabbcc',null];
  const synced=mergeCandidates(config,[profile],{portalId:portal,complete:true});assert.deepEqual(parseJSON(exportJSON(synced)).config.ui.customColors,config.ui.customColors);
  assert.equal(parseJSON(exportJSON(synced)).config.profiles[0].color,'#ab12ef');
});
test('palette storage rejects invalid shapes and colors',()=>{
  for(const invalid of [[],['#123456'],['red',null,null,null],['#123456',null,null,null,null],{},[42,null,null,null]])assert.throws(()=>customColors(invalid),/four hex colors/);
  assert.deepEqual(customColors(['#AABBCC',null,'#000000','#ffffff']),['#aabbcc',null,'#000000','#ffffff']);
});
