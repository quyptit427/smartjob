import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';
const Context = createContext(null);
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  function notify(message, type = 'success') {
    clearTimeout(timer.current);
    setToast({ message, type });
    timer.current = setTimeout(() => setToast(null), 5000);
  }
  return (
    <Context.Provider value={notify}>
      {children}
      {toast && (
        <div className={`toast ${toast.type}`} role="status" aria-live="polite">
          {toast.type === 'success' ? (
            <CheckCircle2 size={15} aria-hidden="true" />
          ) : (
            <CircleAlert size={15} aria-hidden="true" />
          )}
          <span>{toast.message}</span>
          <button aria-label="Đóng thông báo" onClick={() => setToast(null)}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export const useToast = () => useContext(Context);
