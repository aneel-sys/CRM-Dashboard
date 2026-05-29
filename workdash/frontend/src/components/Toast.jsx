import { useState, useCallback, createContext, useContext } from 'react';
import { MdCheckCircle, MdError, MdWarning, MdClose, MdInfo } from 'react-icons/md';

const ToastContext = createContext(null);

const CONFIG = {
  success: { icon: MdCheckCircle, color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' },
  error:   { icon: MdError,       color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  warning: { icon: MdWarning,     color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  info:    { icon: MdInfo,        color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'error') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }, []);

  const remove = id => setToasts(t => t.filter(x => x.id !== id));

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-80">
        {toasts.map(t => {
          const cfg = CONFIG[t.type] || CONFIG.info;
          const Icon = cfg.icon;
          return (
            <div
              key={t.id}
              className="flex items-start gap-3 rounded-lg px-4 py-3 fade-up"
              style={{
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
            >
              <Icon size={18} style={{ color: cfg.color, marginTop: 1, shrink: 0 }} />
              <span className="flex-1 text-xs font-medium leading-relaxed" style={{ color: '#111827' }}>
                {t.message}
              </span>
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: '#374151' }}
              >
                <MdClose size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
