import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

const SSECtx = createContext({});

export function SSEProvider({ children }) {
  const { user } = useAuth();
  const [events, setEvents] = useState({});
  const esRef       = useRef(null);
  const retryRef    = useRef(null);
  const retryDelay  = useRef(2000);

  useEffect(() => {
    if (!user) return;

    function connect() {
      const es = new EventSource('/api/stream', { withCredentials: true });
      esRef.current = es;

      es.onopen = () => { retryDelay.current = 2000; };

      ['overview', 'notifications', 'tick'].forEach(type => {
        es.addEventListener(type, (e) => {
          try {
            const data = JSON.parse(e.data);
            setEvents(prev => ({ ...prev, [type]: { data, ts: Date.now() } }));
          } catch {}
        });
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Exponential backoff: 2s → 4s → 8s → max 30s
        retryRef.current = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
          connect();
        }, retryDelay.current);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      clearTimeout(retryRef.current);
    };
  }, [user]);

  return <SSECtx.Provider value={events}>{children}</SSECtx.Provider>;
}

// usage: const sseOverview = useSSE('overview');  → { data, ts } or undefined
export function useSSE(type) {
  return useContext(SSECtx)[type];
}

// convenience: just the connected status
export function useSSEConnected() {
  const ctx = useContext(SSECtx);
  return Object.keys(ctx).length > 0;
}
