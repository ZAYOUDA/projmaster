import { useState } from 'react';
import { useParams } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { calculerCriticite } from '../data/calculations';
import PageHeader from '../components/layout/PageHeader';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const PROBA_LABELS = { faible: 'Faible', moyenne: 'Moyenne', elevee: 'Élevée' };
const IMPACT_LABELS = { faible: 'Faible', moyen: 'Moyen', eleve: 'Élevé' };
const CRITICITE_LABELS = { faible: 'Faible', moyenne: 'Moyenne', elevee: 'Élevée', critique: 'Critique' };
const STATUT_LABELS = { ouvert: 'Ouvert', en_traitement: 'En traitement', clos: 'Clos' };
const STATUT_VARIANT = { ouvert: 'danger', en_traitement: 'warning', clos: 'success' };

const EMPTY = {
  titre: '', description: '', probabilite: 'faible', impact: 'faible',
  statut: 'ouvert', plan_mitigation: '', proprietaire: '', date_identification: new Date().toISOString().slice(0, 10), date_echeance: '',
};

function RisqueForm({ initial = EMPTY, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const criticite = calculerCriticite(form.probabilite, form.impact);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ ...form, criticite }); }}>
      <label style={labelStyle}>Titre *
        <input style={inputStyle} value={form.titre} onChange={(e) => set('titre', e.target.value)} required autoFocus />
      </label>
      <label style={{ ...labelStyle, marginTop: 12 }}>Description
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.description} onChange={(e) => set('description', e.target.value)} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <label style={labelStyle}>Probabilité
          <select style={inputStyle} value={form.probabilite} onChange={(e) => set('probabilite', e.target.value)}>
            {Object.entries(PROBA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Impact
          <select style={inputStyle} value={form.impact} onChange={(e) => set('impact', e.target.value)}>
            {Object.entries(IMPACT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 12px', background: '#F8F8F7', borderRadius: 6 }}>
        <span style={{ fontSize: 12, color: '#5F5E5A' }}>Criticité calculée :</span>
        <Badge label={CRITICITE_LABELS[criticite]} variant={criticite} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <label style={labelStyle}>Statut
          <select style={inputStyle} value={form.statut} onChange={(e) => set('statut', e.target.value)}>
            {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Propriétaire
          <input style={inputStyle} value={form.proprietaire} onChange={(e) => set('proprietaire', e.target.value)} />
        </label>
        <label style={labelStyle}>Date d'identification
          <input type="date" style={inputStyle} value={form.date_identification} onChange={(e) => set('date_identification', e.target.value)} />
        </label>
        <label style={labelStyle}>Date d'échéance
          <input type="date" style={inputStyle} value={form.date_echeance || ''} onChange={(e) => set('date_echeance', e.target.value || null)} />
        </label>
      </div>
      <label style={{ ...labelStyle, marginTop: 12 }}>Plan de mitigation
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.plan_mitigation} onChange={(e) => set('plan_mitigation', e.target.value)} />
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="button" onClick={onCancel} style={btnSecStyle}>Annuler</button>
        <button type="submit" style={btnPrimStyle}>Enregistrer</button>
      </div>
    </form>
  );
}

export default function ProjetRisques() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const addRisque = useAppStore((s) => s.addRisque);
  const updateRisque = useAppStore((s) => s.updateRisque);
  const deleteRisque = useAppStore((s) => s.deleteRisque);
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState('tous');

  const risques = filter === 'tous' ? projet.risques : projet.risques.filter((r) => r.statut === filter);

  return (
    <div style={{ padding: 32 }}>
      <PageHeader
        title="Registre des risques"
        actions={
          <button onClick={() => setModal({ mode: 'add' })} style={btnPrimStyle}>
            <Plus size={14} style={{ marginRight: 4 }} /> Ajouter
          </button>
        }
      />

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['tous', 'ouvert', 'en_traitement', 'clos'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
            border: '1px solid rgba(0,0,0,0.15)',
            background: filter === s ? '#1A1A18' : '#fff',
            color: filter === s ? '#fff' : '#5F5E5A',
          }}>
            {s === 'tous' ? 'Tous' : STATUT_LABELS[s]}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8F8F7', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
              {['#', 'Titre', 'Probabilité', 'Impact', 'Criticité', 'Statut', 'Propriétaire', 'Échéance', ''].map((h) => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#888780' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {risques.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#888780', fontFamily: 'monospace' }}>R-{String(i + 1).padStart(2, '0')}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, maxWidth: 220 }}>{r.titre}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#5F5E5A' }}>{PROBA_LABELS[r.probabilite]}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#5F5E5A' }}>{IMPACT_LABELS[r.impact]}</td>
                <td style={{ padding: '10px 12px' }}><Badge label={CRITICITE_LABELS[r.criticite]} variant={r.criticite} /></td>
                <td style={{ padding: '10px 12px' }}><Badge label={STATUT_LABELS[r.statut]} variant={STATUT_VARIANT[r.statut]} /></td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#5F5E5A' }}>{r.proprietaire || '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#5F5E5A' }}>
                  {r.date_echeance ? new Date(r.date_echeance).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setModal({ mode: 'edit', risque: r })} style={iconBtnStyle}><Pencil size={13} /></button>
                    <button onClick={() => { if (confirm('Supprimer ce risque ?')) deleteRisque(id, r.id); }} style={{ ...iconBtnStyle, color: '#D85A30' }}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {risques.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 48, textAlign: 'center', color: '#888780' }}>Aucun risque enregistré.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Ajouter un risque' : 'Modifier le risque'} onClose={() => setModal(null)} width={560}>
          <RisqueForm
            initial={modal.risque}
            onSave={(data) => {
              if (modal.mode === 'add') addRisque(id, data);
              else updateRisque(id, modal.risque.id, data);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}

const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#5F5E5A' };
const inputStyle = { padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%' };
const btnPrimStyle = { display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, border: 'none', background: '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecStyle = { padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const iconBtnStyle = { padding: 5, borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', display: 'flex', color: '#5F5E5A' };
