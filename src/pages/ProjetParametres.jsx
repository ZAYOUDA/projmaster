import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import PageHeader from '../components/layout/PageHeader';
import Avatar from '../components/ui/Avatar';
import { Plus, Trash2 } from 'lucide-react';

const PALETTE = ['#378ADD', '#1D9E75', '#BA7517', '#D4537E', '#7F77DD', '#D85A30', '#888780', '#5DCAA5', '#EF9F27', '#E24B4A'];

export default function ProjetParametres() {
  const { id } = useParams();
  const navigate = useNavigate();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const updateProjet = useAppStore((s) => s.updateProjet);
  const deleteProjet = useAppStore((s) => s.deleteProjet);
  const setTJM = useAppStore((s) => s.setTJM);
  const removeTJM = useAppStore((s) => s.removeTJM);

  const handleDelete = () => {
    if (confirm(`Supprimer définitivement le projet "${projet.nom}" et toutes ses données (WBS, planning, budget…) ?`)) {
      deleteProjet(id);
      navigate('/');
    }
  };

  const [form, setForm] = useState({
    nom: projet.nom,
    description: projet.description || '',
    couleur: projet.couleur,
    statut: projet.statut,
    date_debut: projet.date_debut || '',
    date_fin_prevue: projet.date_fin_prevue || '',
  });
  const [saved, setSaved] = useState(false);
  const [addingCollab, setAddingCollab] = useState(false);
  const [newCollabId, setNewCollabId] = useState('');
  const [newTjm, setNewTjm] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = (e) => {
    e.preventDefault();
    updateProjet(id, form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const collabsDisponibles = collaborateurs.filter((c) => c.actif && !projet.tjm.find((t) => t.collaborateur_id === c.id));

  const handleAddCollab = () => {
    if (!newCollabId || !newTjm) return;
    setTJM(id, newCollabId, parseFloat(newTjm));
    setNewCollabId('');
    setNewTjm('');
    setAddingCollab(false);
  };

  return (
    <div style={{ padding: 32, maxWidth: 700 }}>
      <PageHeader title="Paramètres du projet" />

      <form onSubmit={handleSave}>
        <section style={cardStyle}>
          <h3 style={h3Style}>Informations générales</h3>
          <label style={labelStyle}>
            Nom du projet *
            <input style={inputStyle} value={form.nom} onChange={(e) => set('nom', e.target.value)} required />
          </label>
          <label style={{ ...labelStyle, marginTop: 12 }}>
            Description
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
            <label style={labelStyle}>
              Date de début
              <input type="date" style={inputStyle} value={form.date_debut} onChange={(e) => set('date_debut', e.target.value)} />
            </label>
            <label style={labelStyle}>
              Date de fin prévue
              <input type="date" style={inputStyle} value={form.date_fin_prevue} onChange={(e) => set('date_fin_prevue', e.target.value)} />
            </label>
          </div>
          <label style={{ ...labelStyle, marginTop: 12 }}>
            Statut
            <select style={inputStyle} value={form.statut} onChange={(e) => set('statut', e.target.value)}>
              <option value="actif">Actif</option>
              <option value="en_pause">En pause</option>
              <option value="cloture">Clôturé</option>
            </select>
          </label>
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#5F5E5A', fontWeight: 500 }}>Couleur du projet</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {PALETTE.map((c) => (
                <button key={c} type="button" onClick={() => set('couleur', c)} style={{
                  width: 28, height: 28, borderRadius: '50%', background: c,
                  border: form.couleur === c ? '3px solid #1A1A18' : '2px solid transparent',
                  cursor: 'pointer', outline: 'none',
                }} />
              ))}
            </div>
          </div>
        </section>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <button type="submit" style={btnPrimStyle}>Enregistrer</button>
          {saved && <span style={{ fontSize: 13, color: '#1D9E75', alignSelf: 'center' }}>✓ Sauvegardé</span>}
        </div>
      </form>

      {/* TJM */}
      <section style={cardStyle}>
        <h3 style={{ ...h3Style, marginBottom: 4 }}>Taux journaliers (TJM)</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#5F5E5A' }}>Définissez le TJM de chaque collaborateur pour ce projet.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}>
              {['Collaborateur', 'Profil', 'TJM (€)', ''].map((h) => (
                <th key={h} style={{ padding: '8px 0', textAlign: 'left', fontSize: 12, color: '#888780', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projet.tjm.map((t) => {
              const c = collaborateurs.find((x) => x.id === t.collaborateur_id);
              if (!c) return null;
              return (
                <tr key={t.collaborateur_id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                  <td style={{ padding: '10px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar collaborateur={c} size={28} />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{c.prenom} {c.nom}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 0', fontSize: 13, color: '#5F5E5A' }}>{c.profil}</td>
                  <td style={{ padding: '10px 0' }}>
                    <input
                      type="number"
                      value={t.montant}
                      onChange={(e) => setTJM(id, t.collaborateur_id, parseFloat(e.target.value) || 0)}
                      style={{ ...inputStyle, width: 100 }}
                    />
                  </td>
                  <td style={{ padding: '10px 0' }}>
                    <button onClick={() => removeTJM(id, t.collaborateur_id)} style={iconBtnStyle} title="Retirer">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {addingCollab ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-end' }}>
            <label style={{ ...labelStyle, flex: 1 }}>
              Collaborateur
              <select style={inputStyle} value={newCollabId} onChange={(e) => setNewCollabId(e.target.value)}>
                <option value="">Sélectionner…</option>
                {collabsDisponibles.map((c) => (
                  <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
                ))}
              </select>
            </label>
            <label style={{ ...labelStyle, width: 120 }}>
              TJM (€)
              <input type="number" style={inputStyle} value={newTjm} onChange={(e) => setNewTjm(e.target.value)} placeholder="650" />
            </label>
            <button onClick={handleAddCollab} style={btnPrimStyle}>Ajouter</button>
            <button onClick={() => setAddingCollab(false)} style={btnSecStyle}>Annuler</button>
          </div>
        ) : (
          <button onClick={() => setAddingCollab(true)} style={{ ...btnSecStyle, marginTop: 12 }}>
            <Plus size={14} style={{ marginRight: 4 }} />
            Ajouter un collaborateur au projet
          </button>
        )}
      </section>

      {/* Zone dangereuse */}
      <section style={{ ...cardStyle, border: '1px solid #FECACA', background: '#FFF5F5' }}>
        <h3 style={{ ...h3Style, color: '#DC2626' }}>Zone dangereuse</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#1A1A18' }}>Supprimer ce projet</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888780' }}>
              Supprime définitivement le projet, tout son WBS, planning, budget et jalons. Action irréversible.
            </p>
          </div>
          <button onClick={handleDelete} style={{ ...btnPrimStyle, background: '#DC2626', flexShrink: 0, gap: 6 }}>
            <Trash2 size={14} /> Supprimer le projet
          </button>
        </div>
      </section>
    </div>
  );
}

const cardStyle = { background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, padding: 24, marginBottom: 24 };
const h3Style = { margin: '0 0 16px', fontSize: 14, fontWeight: 600 };
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#5F5E5A' };
const inputStyle = { padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%' };
const btnPrimStyle = { display: 'inline-flex', alignItems: 'center', padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecStyle = { display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const iconBtnStyle = { padding: 6, borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#D85A30' };
