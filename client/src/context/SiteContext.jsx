import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';
import { MINISTRY_NAME } from '../constants.js';

// Публичные настройки сайта (меняются министром в админ-панели → Настройки).
const DEFAULTS = { serverName: '', appealsForumUrl: '' };

const SiteContext = createContext({ ...DEFAULTS, stateName: '', refreshSite: () => {} });
export const useSite = () => useContext(SiteContext);

export function SiteProvider({ children }) {
  const [site, setSite] = useState(DEFAULTS);

  const refreshSite = useCallback(async () => {
    try {
      setSite(await api.site());
    } catch {
      /* оставляем прежние значения */
    }
  }, []);

  useEffect(() => {
    refreshSite();
  }, [refreshSite]);

  useEffect(() => {
    document.title = site.serverName ? `${MINISTRY_NAME} — ${site.serverName}` : MINISTRY_NAME;
  }, [site.serverName]);

  const stateName = site.serverName ? `штат ${site.serverName}` : '';

  return (
    <SiteContext.Provider value={{ ...site, stateName, refreshSite }}>{children}</SiteContext.Provider>
  );
}
