import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

const SSECtx = createContext({ events: {}, connected: false });

export function SSEProvider({ children }) {
  const { user } = useAuth();
  const [events, setEvents]       = useState({});
  const [connected, setConnected] = useState(false);
  const esRef      = useRef(null);
  const retryRef   = useRef(null);
  const retryDelay = useRef(2000);

  useEffect(() => {
    if (!user) return;

    function connect() {
      const es = new EventSource('/api/stream', { withCredentials: true });
      esRef.current = es;

      es.onopen = () => { setConnected(true); retryDelay.current = 2000; };

      ['overview', 'notifications', 'tick'].forEach(type => {
        es.addEventListener(type, (e) => {
          try {
            const data = JSON.parse(e.data);
            setEvents(prev => ({ ...prev, [type]: { data, ts: Date.now() } }));
          } catch {}
        });
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        esRef.current = null;
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
      setConnected(false);
    };
  }, [user]);

  return <SSECtx.Provider value={{ events, connected }}>{children}</SSECtx.Provider>;
}

// useSSE('overview') → { data, ts } | undefined
export function useSSE(type) {
  return useContext(SSECtx).events[type];
}

// true once EventSource fires onopen
export function useSSEConnected() {
  return useContext(SSECtx).connected;
}
