import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, Pencil } from 'lucide-react';
import useAppStore from '../../store/useAppStore';
import Modal from '../ui/Modal';

const cardStyle = { background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, padding: 24, marginBottom: 24 };
const h3Style = { margin: '0 0 4px', fontSize: 14, fontWeight: 600 };
const inputStyle = { padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%' };
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#5F5E5A' };
const btnPrimStyle = { display: 'inline-flex', alignItems: 'center', padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecStyle = { display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const iconBtnStyle = { padding: 6, borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' };

function CommandeForm({ projetId, collaborateurs, initial, onClose }) {
  const addCommande = useAppStore((s) => s.addCommande);
  const updateCommande = useAppStore((s) => s.updateCommande);
  const isEdit = !!initial;

  const [numero, setNumero] = useState(initial?.numero || '');
  const [lot, setLot] = useState(initial?.lot || '');
  const [annee, setAnnee] = useState(initial?.annee || new Date().getFullYear());
  const [lignes, setLignes] = useState(initial?.lignes || []);
  const [error, setError] = useState('');

  const addLigne = () => setLignes((ls) => [...ls, { id: uuidv4(), collabId: '', pu: 0, nbjCommande: null }]);
  const updateLigne = (id, patch) => setLignes((ls) => ls.map((l) => l.id === id ? { ...l, ...patch } : l));
  const removeLigne = (id) => setLignes((ls) => ls.filter((l) => l.id !== id));

  const handleSave = () => {
    if (!numero.trim()) { setError('Le numéro de commande est obligatoire.'); return; }
    if (lignes.some((l) => !l.collabId)) { setError('Chaque ligne doit avoir un collaborateur sélectionné.'); return; }
    const data = { numero: numero.trim(), lot: lot.trim() || null, annee: Number(annee), lignes };
    if (isEdit) updateCommande(projetId, initial.id, data);
    else addCommande(projetId, data);
    onClose();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <p style={{ margin: 0, fontSize: 12, color: '#D85A30' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ ...labelStyle, flex: 1 }}>
          Numéro *
          <input style={inputStyle} value={numero} onChange={(e) => setNumero(e.target.value)} autoFocus />
        </label>
        <label style={{ ...labelStyle, flex: 1 }}>
          Lot (optionnel)
          <input style={inputStyle} value={lot} onChange={(e) => setLot(e.target.value)} />
        </label>
        <label style={{ ...labelStyle, width: 100 }}>
          Année
          <input type="number" style={inputStyle} value={annee} onChange={(e) => setAnnee(e.target.value)} />
        </label>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#5F5E5A' }}>Lignes (collaborateur × PU × NBJ commandé)</span>
          <button type="button" onClick={addLigne} style={{ ...btnSecStyle, padding: '4px 10px', fontSize: 12 }}>
            <Plus size={12} style={{ marginRight: 4 }} /> Ajouter une ligne
          </button>
        </div>
        {lignes.length === 0 && <p style={{ fontSize: 12, color: '#888780', margin: 0 }}>Aucune ligne.</p>}
        {lignes.map((l) => (
          <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <select style={{ ...inputStyle, flex: 1 }} value={l.collabId} onChange={(e) => updateLigne(l.id, { collabId: e.target.value })}>
              <option value="">Collaborateur…</option>
              {collaborateurs.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </select>
            <input type="number" placeholder="PU €" style={{ ...inputStyle, width: 90 }} value={l.pu} onChange={(e) => updateLigne(l.id, { pu: parseFloat(e.target.value) || 0 })} />
            <input
              type="number" placeholder="NBJ" step="0.25" style={{ ...inputStyle, width: 90 }}
              value={l.nbjCommande ?? ''}
              onChange={(e) => updateLigne(l.id, { nbjCommande: e.target.value === '' ? null : parseFloat(e.target.value) })}
            />
            <button type="button" onClick={() => removeLigne(l.id)} style={{ ...iconBtnStyle, color: '#D85A30' }} title="Retirer">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} style={btnSecStyle}>Annuler</button>
        <button type="button" onClick={handleSave} style={btnPrimStyle}>{isEdit ? 'Enregistrer' : 'Créer la commande'}</button>
      </div>
    </div>
  );
}

export default function CommandesRunSection({ projet, collaborateurs }) {
  const deleteCommande = useAppStore((s) => s.deleteCommande);
  const [editing, setEditing] = useState(null); // null | 'new' | commandeObj
  const [anneeVue, setAnneeVue] = useState(new Date().getFullYear());

  const toutesCommandes = projet.commandes || [];
  const commandes = toutesCommandes
    .filter((c) => c.annee === anneeVue)
    .sort((a, b) => (a.dateCreation || '').localeCompare(b.dateCreation || ''));

  const years = [...new Set(toutesCommandes.map((c) => c.annee))];
  if (!years.includes(anneeVue)) years.push(anneeVue);
  years.sort();

  const handleDelete = async (cmd) => {
    if (!confirm(`Supprimer la commande ${cmd.numero} ?`)) return;
    try {
      await deleteCommande(projet.id, cmd.id);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={h3Style}>Bons de commande</h3>
        <select style={{ ...inputStyle, width: 100 }} value={anneeVue} onChange={(e) => setAnneeVue(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#5F5E5A' }}>
        Un même collaborateur peut apparaître sur plusieurs commandes, avec des PU différents.
      </p>

      {commandes.length === 0 && <p style={{ fontSize: 13, color: '#888780' }}>Aucune commande pour {anneeVue}.</p>}
      {commandes.map((cmd) => (
        <div key={cmd.id} style={{ border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {cmd.numero}
              {cmd.lot ? <span style={{ color: '#888780', fontWeight: 400 }}> · {cmd.lot}</span> : null}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setEditing(cmd)} style={iconBtnStyle} title="Modifier"><Pencil size={13} /></button>
              <button onClick={() => handleDelete(cmd)} style={{ ...iconBtnStyle, color: '#D85A30' }} title="Supprimer"><Trash2 size={13} /></button>
            </div>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#5F5E5A' }}>
            {(cmd.lignes || []).length === 0 && <span>Aucune ligne.</span>}
            {(cmd.lignes || []).map((l) => {
              const c = collaborateurs.find((x) => x.id === l.collabId);
              return (
                <div key={l.id}>
                  {c ? `${c.prenom} ${c.nom}` : '? (collaborateur introuvable)'} — {l.pu} €/j
                  {l.nbjCommande != null ? ` · ${l.nbjCommande} j commandés` : ' · sans enveloppe propre'}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button onClick={() => setEditing('new')} style={btnSecStyle}>
        <Plus size={14} style={{ marginRight: 4 }} /> Nouvelle commande
      </button>

      {editing && (
        <Modal title={editing === 'new' ? 'Nouvelle commande' : `Modifier — ${editing.numero}`} onClose={() => setEditing(null)} width={560}>
          <CommandeForm projetId={projet.id} collaborateurs={collaborateurs} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
        </Modal>
      )}
    </section>
  );
}
