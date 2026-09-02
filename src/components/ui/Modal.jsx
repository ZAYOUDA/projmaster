import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ title, onClose, children, width = 520, preventClose = false }) {
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && !preventClose && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, preventClose]);

  // Rendu via portail dans document.body — pas dans l'arbre React local (ex. Sidebar). Sans ça,
  // un ancêtre quelconque (Sidebar ou autre) peut créer un contexte d'empilement CSS qui piège
  // notre z-index:1000, et un élément `position: sticky` ailleurs sur la page (ex. l'en-tête
  // figé d'un tableau) se retrouve à s'afficher PAR-DESSUS la modale — bug constaté sur "Nouveau
  // projet" avec l'en-tête du tableau "Charge des collaborateurs" du Dashboard qui passait
  // devant. Le portail garantit que la modale est toujours un enfant direct de <body>, donc
  // toujours au sommet de la pile d'empilement, quel que soit l'endroit d'où elle est ouverte.
  return createPortal(
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
    </div>,
    document.body
  );
}
