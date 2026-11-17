export const SESSION_CHECK_MS = 30_000;

// A popup has no background lifetime. Poll only while its view is visible,
// without touching portal synchronisation or persisting a stale enabled flag.
export function monitorMultiSession(api, onResult, {clock = globalThis, doc = document} = {}) {
  let stopped = false, checking = false;
  async function check() {
    if (stopped || checking || doc.hidden) return;
    checking = true;
    let mode, sessions;
    try { const result = await api.send('CHECK_MULTI_SESSION'); mode = result.multiSession; sessions=result.sessions; }
    catch { mode = {status: 'unknown'}; }
    checking = false;
    if (!stopped) onResult(mode || {status: 'unknown'},sessions);
  }
  const interval = clock.setInterval(check, SESSION_CHECK_MS);
  const visible = () => { if (!doc.hidden) check(); };
  doc.addEventListener('visibilitychange', visible);
  return {
    check,
    stop() { stopped = true; clock.clearInterval(interval); doc.removeEventListener('visibilitychange', visible); }
  };
}
