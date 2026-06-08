import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const DEFAULTS = {
  appName: 'CRM Dashboard',
  appSubtitle: 'Analytics Dashboard',
  logoUrl: null,
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
        });
      }
    } catch {
      // keep defaults on network failure
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <SettingsContext.Provider value={{ ...settings, reload: load }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
