import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { MdCheckCircle, MdError, MdWarning, MdClose } from 'react-icons/md';

const ToastContext = createContext(null);

const ICONS = {
  success: <MdCheckCircle className="text-green-500" size={20} />,
  error: <MdError className="text-red-500" size={20} />,
  warning: <MdWarning className="text-yellow-500" size={20} />,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'error') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  const remove = (id) => setToasts(t => t.filter(x => x.id !== id));

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className="flex items-center gap-3 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-lg px-4 py-3 min-w-72 fade-in">
            {ICONS[t.type]}
            <span className="text-sm text-[var(--color-text)] flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
              <MdClose size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
