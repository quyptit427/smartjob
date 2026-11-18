import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';

const Context = createContext(null);

const FLASH_META = {
  success: { title: 'Thành công', Icon: CheckCircle2 },
  error: { title: 'Thông báo lỗi', Icon: CircleAlert },
  info: { title: 'Thông báo', Icon: Info },
};

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();

  useEffect(() => () => clearTimeout(timer.current), []);

  function notify(message, type = 'success') {
    clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, message, type });
    timer.current = setTimeout(() => setToast(null), 5000);
  }

  const meta = toast ? FLASH_META[toast.type] || FLASH_META.success : null;
  const Icon = meta?.Icon;

  return (
    <Context.Provider value={notify}>
      {children}
      {toast && (
        <div
          key={toast.id}
          className={`toast flash-message ${toast.type}`}
          role="status"
          aria-live="polite"
        >
          <div className="flash-icon" aria-hidden="true">
            <Icon size={20} strokeWidth={2.3} />
          </div>
          <div className="flash-body">
            <strong className="flash-title">{meta.title}</strong>
            <span className="flash-text">{toast.message}</span>
          </div>
          <button
            type="button"
            className="flash-close"
            aria-label="Đóng thông báo"
            onClick={() => setToast(null)}
          >
            <X size={16} aria-hidden="true" />
          </button>
          <span className="flash-progress" aria-hidden="true" />
        </div>
      )}
    </Context.Provider>
  );
}

export const useToast = () => useContext(Context);
