import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const DEFAULTS = {
  appName: 'CRM Dashboard',
  appSubtitle: 'Analytics Dashboard',
  logoUrl: null,
  timeFormat: '24h',
};

const SettingsContext = createContext({ ...DEFAULTS, reload: () => {} });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);

  const load = async () => {
    try {
      const { data } = await api.get('/settings/public');
      if (data.success) {
        setSettings({
          appName: data.appName,
          appSubtitle: data.appSubtitle,
          logoUrl: data.logoUrl,
          timeFormat: data.timeFormat || '24h',
        });
      }
    } catch {
      // keep defaults on network failure
    }
  };

  useEffect(() => { load(); }, []);

  // Keep favicon in sync with the uploaded logo
  useEffect(() => {
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    if (settings.logoUrl) {
      link.href = settings.logoUrl + '?v=' + Date.now();
      link.type = '';
    } else {
      link.href = '/favicon.svg';
      link.type = 'image/svg+xml';
    }
  }, [settings.logoUrl]);

  return (
    <SettingsContext.Provider value={{ ...settings, reload: load }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
