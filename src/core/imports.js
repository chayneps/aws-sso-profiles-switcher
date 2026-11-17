import {emptyConfig, normalizePortal, sanitizeConfig, sanitizeProfile} from './model.js';
export function parseJSON(text) {
  if (text.length > 5_000_000) throw new Error('File is too large (maximum 5 MB).');
  try { return {config: sanitizeConfig(JSON.parse(text)), warnings: []}; } catch (error) { throw new Error(`JSON import: ${error.message}`); }
}
export function parseINI(text, fallbackPortal = '') {
  if (text.length > 5_000_000) throw new Error('File is too large (maximum 5 MB).');
  const sections = new Map();
  let current;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || /^[;#]/.test(line)) continue;
    const header = line.match(/^\[([^\]]+)\]\s*(?:[;#].*)?$/);
    if (header) { current = {name: header[1], values: Object.create(null)}; sections.set(current.name, current); continue; }
    const pair = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!current || !pair) throw new Error(`INI line ${index + 1}: expected a section or key = value.`);
    // Explicit allowlist: secrets are discarded immediately, never copied into the parsed model.
    if (['sso_start_url','sso_session','sso_account_id','sso_role_name','region','color','role_arn','source_profile','role_name','aws_account_id'].includes(pair[1].toLowerCase())) current.values[pair[1].toLowerCase()] = pair[2];
  }
  const config = emptyConfig(), warnings = [];
  for (const {name, values: v} of sections.values()) {
    if (name.startsWith('sso-session ')) continue;
    const label = name.replace(/^profile\s+/, '');
    const session = v.sso_session ? sections.get(`sso-session ${v.sso_session}`)?.values : null;
    if (v.sso_session && !session) { warnings.push(`${label}: missing sso-session ${v.sso_session}.`); continue; }
    if (!v.sso_account_id || !v.sso_role_name) {
      warnings.push(`${label}: no complete SSO account/permission-set assignment${v.role_arn || v.source_profile || v.role_name ? '; IAM assume-role entries cannot be converted automatically' : ''}.`); continue;
    }
    try {
      const portalId = normalizePortal(v.sso_start_url || session?.sso_start_url || fallbackPortal);
      if (!config.portals.some(p => p.id === portalId)) config.portals.push({id: portalId, baseUrl: portalId, label: ''});
      const p = sanitizeProfile({portalId, accountId: v.sso_account_id, permissionSet: v.sso_role_name, label,
        region: v.region || '', color: v.color ? (v.color.startsWith('#') ? v.color : `#${v.color}`) : undefined});
      config.profiles.push(p);
    } catch (error) { warnings.push(`${label}: ${error.message}`); }
  }
  if (!config.profiles.length) throw new Error(`No usable SSO profiles found. ${warnings.join(' ')}`);
  return {config: sanitizeConfig(config), warnings};
}
export function exportJSON(config) { return JSON.stringify(sanitizeConfig(config), null, 2); }
