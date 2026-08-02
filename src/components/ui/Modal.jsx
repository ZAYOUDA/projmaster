import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, onClose, children, width = 520, preventClose = false }) {
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && !preventClose && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, preventClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => e.target === e.currentTarget && !preventClose && onClose()}
    >
      <div style={{
        background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', borderRadius: 12, padding: 24,
        width, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 80px)',
        overflowY: 'auto', boxShadow: '0 8px 32px var(--color-shadow)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: 'var(--color-text-secondary)' }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
