import {scanPortal, preparePortalForSync} from '../core/portal-scan.js';
if (!globalThis.__awsSsoPortalAdapter) {
  globalThis.__awsSsoPortalAdapter = true;
  let active;
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'PORTAL_CANCEL' && active?.jobId === message.jobId) { active.cancelled = true; reply({ok: true}); }
    if (message.type !== 'PORTAL_SCAN') return;
    if (active && !active.finished) { reply({error: 'A scan is already running in this tab.'}); return; }
    const job = active = {jobId: message.jobId, cancelled: false};
    reply({ok: true});
    const scanOptions = {document, portalId: message.portalId, cancelled: () => job.cancelled,
      onProgress: progress => chrome.runtime.sendMessage({type: 'SCAN_PROGRESS', jobId: job.jobId, progress}).catch(() => { job.cancelled = true; })};
    Promise.resolve().then(async () => {
      if (message.fullSync) await preparePortalForSync(scanOptions);
      return scanPortal(scanOptions);
    })
      .then(result => chrome.runtime.sendMessage({type: 'SCAN_RESULT', jobId: job.jobId, result}))
      .catch(() => chrome.runtime.sendMessage({type: 'SCAN_RESULT', jobId: job.jobId, result: {candidates: [], complete: false, cancelled: job.cancelled, warnings: ['Portal could not be read. Retry synchronisation.'], progress: {accounts: 0, profiles: 0, pages: 0}}}).catch(() => {}))
      .finally(() => { job.finished = true; });
  });
}
