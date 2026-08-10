import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import PageHeader from '../components/layout/PageHeader';
import Modal from '../components/ui/Modal';
import Avatar from '../components/ui/Avatar';
import { Plus, Pencil, Archive, ArchiveRestore, CalendarOff } from 'lucide-react';

const PALETTE = ['#378ADD', '#1D9E75', '#BA7517', '#D4537E', '#7F77DD', '#D85A30', '#888780', '#5DCAA5', '#EF9F27', '#E24B4A', '#5F5E5A', '#1A1A18'];

function CollaborateurForm({ initial = {}, onSave, onCancel }) {
  const [form, setForm] = useState({
    prenom: '', nom: '', profil: '', couleur: PALETTE[0], ...initial,
  });

  const initiales = form.initiales || `${form.prenom[0] || ''}${form.nom[0] || ''}`.toUpperCase();

  const set = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v };
    if (k === 'prenom' || k === 'nom') {
      next.initiales = `${next.prenom[0] || ''}${next.nom[0] || ''}`.toUpperCase();
    }
    return next;
  });

  const valid = form.prenom.trim() && form.nom.trim();

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ ...form, initiales }); }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <label style={labelStyle}>
          Prénom *
          <input style={inputStyle} value={form.prenom} onChange={(e) => set('prenom', e.target.value)} autoFocus />
        </label>
        <label style={labelStyle}>
          Nom *
          <input style={inputStyle} value={form.nom} onChange={(e) => set('nom', e.target.value)} />
        </label>
      </div>
      <label style={{ ...labelStyle, marginBottom: 16 }}>
        Profil
        <input style={inputStyle} value={form.profil} onChange={(e) => set('profil', e.target.value)} placeholder="ex: Développeur Senior" />
      </label>
      <label style={{ ...labelStyle, marginBottom: 16 }}>
        Initiales
        <input style={{ ...inputStyle, width: 80 }} value={form.initiales || initiales} onChange={(e) => set('initiales', e.target.value.toUpperCase().slice(0, 3))} />
      </label>
      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Couleur</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => set('couleur', c)} style={{
              width: 28, height: 28, borderRadius: '50%', background: c, border: form.couleur === c ? '3px solid var(--color-text-primary)' : '2px solid transparent',
              cursor: 'pointer', outline: 'none',
            }} />
          ))}
        </div>
      </div>
      {/* Preview */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderTop: '0.5px solid var(--color-border)', marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: form.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: '#FFFFFF' }}>
          {form.initiales || initiales || '??'}
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 500, fontSize: 13 }}>{form.prenom || 'Prénom'} {form.nom || 'Nom'}</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>{form.profil || 'Profil'}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={btnSecStyle}>Annuler</button>
        <button type="submit" disabled={!valid} style={{ ...btnPrimStyle, opacity: valid ? 1 : 0.5 }}>Enregistrer</button>
      </div>
    </form>
  );
}

const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' };
// background + color explicites : sinon le <select>/<input> hérite du color: text-secondary
// du <label> parent tout en gardant un fond blanc natif — illisible en thème sombre.
const inputStyle = { padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, outline: 'none', width: '100%', fontFamily: 'inherit', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)' };
const btnPrimStyle = { padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecStyle = { padding: '8px 16px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' };

export default function Collaborateurs() {
  const navigate = useNavigate();
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const addCollaborateur = useAppStore((s) => s.addCollaborateur);
  const updateCollaborateur = useAppStore((s) => s.updateCollaborateur);
  const toggleActif = useAppStore((s) => s.toggleCollaborateurActif);
  const projets = useAppStore((s) => s.projets);

  const [modal, setModal] = useState(null); // null | { mode: 'add' | 'edit', collab?: obj }

  const actifs = collaborateurs.filter((c) => c.actif);
  const archives = collaborateurs.filter((c) => !c.actif);

  const projetsCollab = (id) => projets.filter((p) => p.wbs.some((n) => n.affectations.some((a) => a.collaborateur_id === id)));

  // Nb jours congés par collab
  const nbCongesCollab = (c) => Object.values(c.conges || {}).reduce((s, v) => s + v, 0);

  return (
    <div style={{ padding: 32 }}>
      <PageHeader
        title="Collaborateurs"
        subtitle={`${actifs.length} actif${actifs.length > 1 ? 's' : ''}`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => navigate('/conges')} style={btnSecStyle}>
              <CalendarOff size={14} style={{ display: 'inline', marginRight: 6 }} />
              Congés équipe
            </button>
            <button onClick={() => setModal({ mode: 'add' })} style={btnPrimStyle}>
              <Plus size={14} style={{ display: 'inline', marginRight: 6 }} />
              Ajouter
            </button>
          </div>
        }
      />

      {/* Actifs */}
      <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
              {['Collaborateur', 'Profil', 'Projets impliqués', 'Congés', 'Actions'].map((h) => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {actifs.map((c) => {
              const ps = projetsCollab(c.id);
              const nbConges = nbCongesCollab(c);
              return (
                <tr key={c.id} style={{ borderBottom: '0.5px solid var(--color-border-soft)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar collaborateur={c} size={32} />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{c.prenom} {c.nom}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{c.profil || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {ps.length === 0 && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Aucun</span>}
                      {ps.map((p) => (
                        <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '2px 8px', background: 'var(--color-bg-tertiary)', borderRadius: 99 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.couleur }} />
                          {p.nom}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {nbConges > 0 ? (
                      <span style={{ fontSize: 12, color: 'var(--color-danger)', fontWeight: 600 }}>{nbConges % 1 === 0 ? nbConges : nbConges.toFixed(1)}j</span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setModal({ mode: 'edit', collab: c })} style={iconBtnStyle} title="Modifier">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => toggleActif(c.id)} style={iconBtnStyle} title="Archiver">
                        <Archive size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {actifs.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Aucun collaborateur actif.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Archivés */}
      {archives.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontWeight: 500, margin: '0 0 12px' }}>Archivés ({archives.length})</h3>
          <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {archives.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '0.5px solid var(--color-border-soft)', opacity: 0.6 }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar collaborateur={c} size={28} />
                        <span style={{ fontSize: 13 }}>{c.prenom} {c.nom}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--color-text-tertiary)' }}>{c.profil || '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <button onClick={() => toggleActif(c.id)} style={iconBtnStyle} title="Restaurer">
                        <ArchiveRestore size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal édition */}
      {modal && (modal.mode === 'add' || modal.mode === 'edit') && (
        <Modal
          title={modal.mode === 'add' ? 'Ajouter un collaborateur' : 'Modifier le collaborateur'}
          onClose={() => setModal(null)}
        >
          <CollaborateurForm
            initial={modal.collab}
            onSave={(data) => {
              if (modal.mode === 'add') addCollaborateur(data);
              else updateCollaborateur(modal.collab.id, data);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}

const iconBtnStyle = {
  padding: '6px', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)',
};
