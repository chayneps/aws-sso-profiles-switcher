export function createAPI() {
  const api = globalThis.chrome;
  if (!api?.runtime?.id) throw new Error('Open this page from the installed extension, or use npm run preview.');
  return {
    async send(type, fields = {}) {
      const response = await api.runtime.sendMessage({type, ...fields});
      if (!response?.ok) throw new Error(response?.error || 'The extension is unavailable. Reload this page and try again.');
      return response;
    },
    subscribe(fn) {
      let timer;
      const listener = () => { clearTimeout(timer); timer = setTimeout(fn, 80); };
      api.storage.onChanged.addListener(listener);
      return () => { clearTimeout(timer); api.storage.onChanged.removeListener(listener); };
    },
    requestOrigin(origin) { return api.permissions.request({origins: [origin]}); },
    hasOrigin(origin) { return api.permissions.contains({origins: [origin]}); },
    openOptions() { return api.runtime.openOptionsPage(); }
  };
}
