import {customColors,PRESET_COLORS} from './colors.js';
export const SCHEMA_VERSION = 1;
export const THEMES = ['system', 'light', 'dark'];
export const DEFAULT_COLOR = PRESET_COLORS[3].value;
export const SYNC_INTERVALS = [0, 15, 30, 60];
export const validAccount = value => typeof value === 'string' && /^\d{12}$/.test(value);
export const validRegion = value => typeof value === 'string' && /^(?:af-south|ap-(?:east|south|southeast|northeast)|ca-(?:central|west)|eu-(?:central|west|south|north)|il-central|me-(?:south|central)|mx-central|sa-east|us-(?:east|west))-\d$/.test(value);
export function cleanText(value, max = 256) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid text value.');
  return value.trim();
}
export function normalizePortal(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Enter a valid HTTPS AWS access portal URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Portal must use HTTPS without credentials or a custom port.');
  const host = url.hostname.toLowerCase();
  let path;
  if (/^[a-z0-9][a-z0-9-]*\.awsapps\.com$/.test(host)) {
    if (!/^\/start\/?$/.test(url.pathname)) throw new Error('AWS access portal URL must include /start.');
    path = '/start/';
  } else if (/^ssoins-[a-z0-9]+\.portal\.[a-z]{2}(?:-[a-z]+)+-\d\.app\.aws$/.test(host)) {
    if (url.pathname !== '/') throw new Error('Instance access portal URLs use the root path.');
    path = '/';
  } else if (/^portal\.[a-z]{2}(?:-[a-z]+)+-\d\.app\.aws$/.test(host)) {
    const match = url.pathname.match(/^\/start\/([a-zA-Z0-9_-]+)\/?$/);
    if (!match) throw new Error('Identity Center portal URL must include /start/ followed by its portal identifier.');
    path = `/start/${match[1]}/`;
  } else throw new Error('Use an awsapps.com or portal.<region>.app.aws access portal.');
  return `${url.origin}${path}`;
}
export function profileId(portalId, accountId, permissionSet) { return JSON.stringify([portalId, accountId, permissionSet]); }
export function sanitizeProfile(raw, portals) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid profile.');
  const portalId = normalizePortal(raw.portalId);
  if (portals && !portals.some(p => p.id === portalId)) throw new Error('Profile references an unknown portal.');
  const accountId = raw.accountId;
  if (!validAccount(accountId)) throw new Error('Account ID must contain exactly 12 digits.');
  const permissionSet = cleanText(raw.permissionSet, 128);
  if (!permissionSet) throw new Error('Permission set is required.');
  if (raw.theme != null && !THEMES.includes(raw.theme)) throw new Error('Theme must be light, dark, or system.');
  if (raw.color != null && !/^#[0-9a-f]{6}$/i.test(raw.color)) throw new Error('Choose a six-digit hex accent color.');
  const region = raw.region == null ? '' : cleanText(raw.region, 32);
  if (region && !validRegion(region)) throw new Error('Enter a supported commercial AWS region, such as us-east-1.');
  const profile = {id: profileId(portalId, accountId, permissionSet), portalId, accountId,
    accountName: cleanText(raw.accountName || '', 256), permissionSet, label: cleanText(raw.label || '', 256),
    theme: raw.theme || 'system', color: raw.color || DEFAULT_COLOR, region, showInPopup: raw.showInPopup !== false,
    availability: ['observed', 'not-seen', 'unknown'].includes(raw.availability) ? raw.availability : 'unknown'};
  if (typeof raw.lastSeenAt === 'number' && Number.isFinite(raw.lastSeenAt)) profile.lastSeenAt = raw.lastSeenAt;
  return profile;
}
export function emptyConfig() { return {version: SCHEMA_VERSION, portals: [], profiles: [], ui: {theme: 'system',tabGroupName:'AWS SSO',customColors:customColors(),accountOrder:[]}}; }
export function sanitizeConfig(raw) {
  if (!raw || raw.version !== SCHEMA_VERSION || !Array.isArray(raw.portals) || !Array.isArray(raw.profiles)) throw new Error('Unsupported configuration. Expected version 1, portals, and profiles.');
  if (raw.profiles.length > 10000 || raw.portals.length > 100) throw new Error('Configuration is too large.');
  const portals = [...new Map(raw.portals.map(p => {
    const id = normalizePortal(p.baseUrl || p.id);
    if (p.syncIntervalMinutes != null && !SYNC_INTERVALS.includes(p.syncIntervalMinutes)) throw new Error('Choose a supported synchronisation interval.');
    return [id, {id, baseUrl: id, label: cleanText(p.label || '', 128), lastImportAt: Number(p.lastImportAt) || undefined, lastImportComplete: p.lastImportComplete === true,
      syncIntervalMinutes: p.syncIntervalMinutes ?? 30,
      syncStatus: ['idle','syncing','synced','partial','sign-in-required','permission-required','error'].includes(p.syncStatus) ? p.syncStatus : 'idle',
      lastAttemptAt: Number(p.lastAttemptAt) || undefined,
      syncMessage: cleanText(p.syncMessage || '', 1024)}];
  })).values()];
  const profiles = [...new Map(raw.profiles.map(p => { const clean = sanitizeProfile(p, portals); return [clean.id, clean]; })).values()];
  const tabGroupName = cleanText(raw.ui?.tabGroupName ?? 'AWS SSO',80);
  if (!tabGroupName) throw new Error('Enter a tab group name.');
  const order=raw.ui?.accountOrder??[];
  if(!Array.isArray(order)||order.length>10000)throw new Error('Invalid account order.');
  const accountOrder=[...new Set(order.map(key=>{
    if(typeof key!=='string'||key.length>1024)throw new Error('Invalid account order.');
    let pair;try{pair=JSON.parse(key);}catch{throw new Error('Invalid account order.');}
    if(!Array.isArray(pair)||pair.length!==2||!validAccount(pair[1]))throw new Error('Invalid account order.');
    return JSON.stringify([normalizePortal(pair[0]),pair[1]]);
  }))];
  return {version: SCHEMA_VERSION, portals, profiles, ui: {theme: THEMES.includes(raw.ui?.theme) ? raw.ui.theme : 'system',tabGroupName,customColors:customColors(raw.ui?.customColors),accountOrder}};
}
export function mergeCandidates(config, candidates, {portalId, complete = false, observedIds, now = Date.now()} = {}) {
  const found = new Set();
  const merged = new Map(config.profiles.map(p => [p.id, {...p}]));
  for (const input of candidates) {
    const p = sanitizeProfile(input, config.portals);
    if (portalId && p.portalId !== portalId) throw new Error('Candidate belongs to another portal.');
    found.add(p.id);
    const old = merged.get(p.id);
    merged.set(p.id, {...p, ...(old || {}), accountName: p.accountName, lastSeenAt: now, availability: 'observed'});
  }
  if (complete && portalId) {
    const inventory = new Set(observedIds || found);
    for (const p of merged.values()) if (p.portalId === portalId) p.availability = inventory.has(p.id) ? 'observed' : 'not-seen';
  }
  return {...config, profiles: [...merged.values()], portals: config.portals.map(p => p.id === portalId ? {...p, lastImportAt: now, lastImportComplete: complete} : p)};
}
export function displayName(p) { return p.label || `${p.accountName || p.accountId} / ${p.permissionSet}`; }
export function popupProfiles(profiles) { return profiles.filter(p => p.showInPopup !== false && p.availability !== 'not-seen'); }
// Preserve the caller's search order, keeping each account's roles
// adjacent. Portal identity stays part of the key even if accounts overlap.
export function groupProfilesByAccount(profiles) {
  const groups = new Map();
  for (const profile of profiles) {
    const key = JSON.stringify([profile.portalId, profile.accountId]);
    if (!groups.has(key)) groups.set(key, {key, portalId:profile.portalId, accountId:profile.accountId, accountName:profile.accountName, profiles:[]});
    const group = groups.get(key);
    if (!group.accountName && profile.accountName) group.accountName = profile.accountName;
    group.profiles.push(profile);
  }
  return [...groups.values()];
}
export function searchProfiles(profiles, query = '') {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return profiles.filter(p => tokens.every(t => [p.label, p.accountName, p.accountId, p.permissionSet].join(' ').toLowerCase().includes(t)))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
}
