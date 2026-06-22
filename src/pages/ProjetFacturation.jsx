import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Eye, CheckCircle, Send, Trash2, X, Settings2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import useAppStore from '../store/useAppStore';
import PageHeader from '../components/layout/PageHeader';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { formatCurrency, calculerBudgetProjet } from '../data/calculations';

// ── Helpers ──────────────────────────────────────────────────────
function formatMois(moisStr) {
  const [year, month] = moisStr.split('-');
  return new Date(+year, +month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
function moisCourt(moisStr) {
  const [year, month] = moisStr.split('-');
  return new Date(+year, +month - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}
function montantFacture(f) { return f.lignes.reduce((s, l) => s + l.montant, 0); }
function montantTTC(f) { return montantFacture(f) * (1 + (f.tva || 0) / 100); }
function isEnRetard(f) { return f.statut === 'emise' && f.date_echeance && new Date(f.date_echeance) < new Date(); }
function statutBadgeProps(f) {
  if (isEnRetard(f)) return { label: 'En retard', variant: 'danger' };
  if (f.statut === 'payee') return { label: 'Payée', variant: 'success' };
  if (f.statut === 'emise') return { label: 'Émise', variant: 'warning' };
  return { label: 'Brouillon', variant: 'neutral' };
}

// ── Calcul suivi par collab ───────────────────────────────────────
function calculerSuiviCollab(projet, collabId) {
  const tjmEntry = projet.tjm.find((t) => t.collaborateur_id === collabId);
  const tjm = tjmEntry?.montant || 0;

  let joursCommandés = 0;
  const parMois = {};

  projet.wbs.forEach((n) => {
    n.affectations
      .filter((a) => a.collaborateur_id === collabId)
      .forEach((a) => {
        joursCommandés += a.jours_prev || 0;
        // Priorité 1 : saisie mensuelle explicite (WBS panneau détail)
        const hasMensuel = Object.keys(a.jours_realises_par_mois || {}).length > 0;
        if (hasMensuel) {
          Object.entries(a.jours_realises_par_mois).forEach(([mois, j]) => {
            parMois[mois] = (parMois[mois] || 0) + j;
          });
        } else {
          // Priorité 2 : planning_reel jour par jour → agrégation par mois
          Object.entries(a.planning_reel || {}).forEach(([date, j]) => {
            const mois = date.slice(0, 7);
            parMois[mois] = (parMois[mois] || 0) + j;
          });
        }
      });
  });

  return { tjm, joursCommandés, montantCommandé: joursCommandés * tjm, parMois };
}

// Tous les mois avec de la saisie dans le projet (mensuel ou planning_reel)
function getAllMois(projet) {
  const s = new Set();
  projet.wbs.forEach((n) => {
    n.affectations.forEach((a) => {
      Object.keys(a.jours_realises_par_mois || {}).forEach((m) => s.add(m));
      Object.keys(a.planning_reel || {}).forEach((date) => s.add(date.slice(0, 7)));
    });
  });
  return [...s].sort();
}

// Collabs ayant des jours_prev ou des jours réalisés dans le projet
function getCollabsActifs(projet, collaborateurs, collabIds) {
  const ids = collabIds.length > 0
    ? collabIds
    : [...new Set(projet.wbs.flatMap((n) => n.affectations.map((a) => a.collaborateur_id)))];
  return ids
    .map((id) => collaborateurs.find((c) => c.id === id))
    .filter(Boolean);
}

// ── Ligne du tableau de suivi ────────────────────────────────────
function SuiviRow({ collab, suivi, moisList, highlightMois }) {
  let cumulConso = 0;
  const montantCmd = suivi.montantCommandé;

  return (
    <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)', verticalAlign: 'middle' }}>
      {/* Collab */}
      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: collab.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
            {collab.initiales}
          </div>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{collab.prenom} {collab.nom}</span>
        </div>
      </td>
      {/* TJM */}
      <td style={{ padding: '8px 12px', fontSize: 12, color: '#5F5E5A', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {suivi.tjm > 0 ? `${suivi.tjm} €` : '—'}
      </td>
      {/* Cmd initiale */}
      <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 500, textAlign: 'right', whiteSpace: 'nowrap', background: '#F8F8F7', borderRight: '2px solid rgba(0,0,0,0.08)' }}>
        {suivi.joursCommandés > 0 ? `${suivi.joursCommandés} j` : '—'}
      </td>
      <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap', background: '#F8F8F7', borderRight: '2px solid rgba(0,0,0,0.1)' }}>
        {montantCmd > 0 ? formatCurrency(montantCmd) : '—'}
      </td>
      {/* Colonnes mensuelles */}
      {moisList.map((mois) => {
        const j = suivi.parMois[mois] || 0;
        const montant = j * suivi.tjm;
        cumulConso += montant;
        const reste = montantCmd - cumulConso;
        const isHL = mois === highlightMois;
        const depassement = montantCmd > 0 && reste < 0;
        return [
          <td key={`${mois}-conso-j`} style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap', background: isHL ? '#FFF9EC' : '' }}>
            {j > 0 ? <span style={{ color: '#D85A30', fontWeight: 500 }}>{j} j</span> : <span style={{ color: '#BDBCB8' }}>—</span>}
          </td>,
          <td key={`${mois}-conso-eur`} style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap', background: isHL ? '#FFF9EC' : '' }}>
            {montant > 0 ? <span style={{ color: '#D85A30', fontWeight: 500 }}>{formatCurrency(montant)}</span> : <span style={{ color: '#BDBCB8' }}>—</span>}
          </td>,
          <td key={`${mois}-reste-j`} style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap', borderRight: '1px solid rgba(0,0,0,0.06)', background: isHL ? '#FFF9EC' : '' }}>
            {montantCmd > 0 ? (
              <span style={{ color: depassement ? '#D85A30' : '#1D9E75', fontWeight: 500 }}>
                {Math.round((montantCmd - cumulConso) / (suivi.tjm || 1))} j
              </span>
            ) : <span style={{ color: '#BDBCB8' }}>—</span>}
          </td>,
          <td key={`${mois}-reste-eur`} style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap', borderRight: '2px solid rgba(0,0,0,0.08)', background: isHL ? '#FFF9EC' : '' }}>
            {montantCmd > 0 ? (
              <span style={{ color: depassement ? '#D85A30' : '#1D9E75', fontWeight: 600 }}>
                {formatCurrency(reste)}
              </span>
            ) : <span style={{ color: '#BDBCB8' }}>—</span>}
          </td>,
        ];
      })}
    </tr>
  );
}

// ── Tableau de suivi d'une commande ──────────────────────────────
function TableauSuivi({ projet, commande, collaborateurs, moisList }) {
  const collabs = getCollabsActifs(projet, collaborateurs, commande.collaborateur_ids);
  if (collabs.length === 0) return (
    <p style={{ fontSize: 12, color: '#888780', padding: '12px 0' }}>
      Aucun collaborateur avec des jours saisis pour cette commande.
    </p>
  );

  // Totaux par mois
  const totaux = moisList.map((mois) => {
    let totalCons = 0, totalReste = 0, cmdTotal = 0;
    collabs.forEach((c) => {
      const s = calculerSuiviCollab(projet, c.id);
      const j = s.parMois[mois] || 0;
      totalCons += j * s.tjm;
      cmdTotal += s.montantCommandé;
    });
    // Cumul reste au niveau du tableau
    return { mois, totalCons, cmdTotal };
  });

  return (
    <div style={{ overflowX: 'auto', marginBottom: 4 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 700, fontSize: 13 }}>
        <thead>
          {/* Header mois */}
          <tr style={{ background: '#F8F8F7', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#888780', width: 160 }}>Collaborateur</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#888780', width: 70 }}>TJM</th>
            <th colSpan={2} style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#5F5E5A', background: '#EFEFED', borderRight: '2px solid rgba(0,0,0,0.1)' }}>
              Cmd initiale
            </th>
            {moisList.map((mois) => (
              <th key={mois} colSpan={4} style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#1A1A18', borderRight: '2px solid rgba(0,0,0,0.08)', background: '#FAFAF9' }}>
                {moisCourt(mois)}
              </th>
            ))}
          </tr>
          {/* Sous-header */}
          <tr style={{ background: '#F8F8F7', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
            <th colSpan={2} />
            <th style={{ padding: '6px 12px', textAlign: 'right', fontSize: 10, fontWeight: 500, color: '#888780', background: '#EFEFED' }}>NBJ</th>
            <th style={{ padding: '6px 12px', textAlign: 'right', fontSize: 10, fontWeight: 500, color: '#888780', background: '#EFEFED', borderRight: '2px solid rgba(0,0,0,0.1)' }}>€ HT</th>
            {moisList.map((mois) => (
              [
                <th key={`${mois}-c-j`} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, fontWeight: 500, color: '#D85A30' }}>NBJ conso.</th>,
                <th key={`${mois}-c-e`} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, fontWeight: 500, color: '#D85A30' }}>€ HT</th>,
                <th key={`${mois}-r-j`} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, fontWeight: 500, color: '#1D9E75' }}>NBJ reste</th>,
                <th key={`${mois}-r-e`} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, fontWeight: 500, color: '#1D9E75', borderRight: '2px solid rgba(0,0,0,0.08)' }}>€ HT</th>,
              ]
            ))}
          </tr>
        </thead>
        <tbody>
          {collabs.map((c) => {
            const suivi = calculerSuiviCollab(projet, c.id);
            return (
              <SuiviRow key={c.id} collab={c} suivi={suivi} moisList={moisList} highlightMois={null} />
            );
          })}
          {/* Ligne totaux */}
          <TotalRow projet={projet} collabs={collabs} moisList={moisList} />
        </tbody>
      </table>
    </div>
  );
}

function TotalRow({ projet, collabs, moisList }) {
  const totCmd = collabs.reduce((s, c) => s + calculerSuiviCollab(projet, c.id).montantCommandé, 0);
  const totJCmd = collabs.reduce((s, c) => s + calculerSuiviCollab(projet, c.id).joursCommandés, 0);
  let cumulConso = 0;

  return (
    <tr style={{ background: '#F8F8F7', borderTop: '2px solid rgba(0,0,0,0.1)', fontWeight: 700 }}>
      <td colSpan={2} style={{ padding: '8px 12px', fontSize: 12, color: '#1A1A18' }}>TOTAL</td>
      <td style={{ padding: '8px 12px', fontSize: 12, textAlign: 'right', background: '#EFEFED' }}>
        {totJCmd > 0 ? `${totJCmd} j` : '—'}
      </td>
      <td style={{ padding: '8px 12px', fontSize: 12, textAlign: 'right', background: '#EFEFED', borderRight: '2px solid rgba(0,0,0,0.1)' }}>
        {totCmd > 0 ? formatCurrency(totCmd) : '—'}
      </td>
      {moisList.map((mois) => {
        let consoMois = 0;
        collabs.forEach((c) => {
          const s = calculerSuiviCollab(projet, c.id);
          consoMois += (s.parMois[mois] || 0) * s.tjm;
        });
        cumulConso += consoMois;
        const reste = totCmd - cumulConso;
        const dep = totCmd > 0 && reste < 0;
        return [
          <td key={`t-${mois}-cj`} style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right', color: '#D85A30' }}>
            {consoMois > 0 ? `${Math.round(consoMois / (totCmd / (totJCmd || 1)))} j` : '—'}
          </td>,
          <td key={`t-${mois}-ce`} style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right', color: '#D85A30' }}>
            {consoMois > 0 ? formatCurrency(consoMois) : '—'}
          </td>,
          <td key={`t-${mois}-rj`} style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right', color: dep ? '#D85A30' : '#1D9E75' }}>
            {totCmd > 0 ? `${Math.round(reste / (totCmd / (totJCmd || 1)))} j` : '—'}
          </td>,
          <td key={`t-${mois}-re`} style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right', color: dep ? '#D85A30' : '#1D9E75', borderRight: '2px solid rgba(0,0,0,0.08)' }}>
            {totCmd > 0 ? formatCurrency(reste) : '—'}
          </td>,
        ];
      })}
    </tr>
  );
}

// ── Modal Commande ────────────────────────────────────────────────
function ModalCommande({ projet, collaborateurs, commande, onClose }) {
  const addCommande = useAppStore((s) => s.addCommande);
  const updateCommande = useAppStore((s) => s.updateCommande);

  const isEdit = !!commande;
  const [numero, setNumero] = useState(commande?.numero || '');
  const [notes, setNotes] = useState(commande?.notes || '');
  const [selectedIds, setSelectedIds] = useState(new Set(commande?.collaborateur_ids || []));

  // Tous les collabs qui ont des affectations dans ce projet
  const collabsProjet = [...new Set(projet.wbs.flatMap((n) => n.affectations.map((a) => a.collaborateur_id)))]
    .map((id) => collaborateurs.find((c) => c.id === id))
    .filter(Boolean);

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    const data = { numero, notes, collaborateur_ids: [...selectedIds] };
    if (isEdit) updateCommande(projet.id, commande.id, data);
    else addCommande(projet.id, data);
    onClose();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={labelStyle}>
        N° commande / référence
        <input style={inputStyle} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: Cmd N06, Support TMA…" autoFocus />
      </label>

      <div>
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500, color: '#5F5E5A' }}>Collaborateurs sur cette commande</p>
        {collabsProjet.length === 0 && (
          <p style={{ fontSize: 12, color: '#888780' }}>Aucun collaborateur affecté dans le WBS.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {collabsProjet.map((c) => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={selectedIds.has(c.id)}
                onChange={() => toggle(c.id)}
                style={{ width: 14, height: 14, accentColor: '#378ADD' }}
              />
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: c.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 600, color: '#fff' }}>
                {c.initiales}
              </div>
              {c.prenom} {c.nom}
            </label>
          ))}
        </div>
      </div>

      <label style={labelStyle}>
        Notes
        <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optionnel" />
      </label>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btnSecStyle}>Annuler</button>
        <button onClick={handleSave} disabled={!numero.trim()} style={{ ...btnPrimStyle, opacity: !numero.trim() ? 0.4 : 1 }}>
          {isEdit ? 'Mettre à jour' : 'Créer la commande'}
        </button>
      </div>
    </div>
  );
}

// ── Onglet Suivi mensuel ──────────────────────────────────────────
function OngletSuivi({ projet, collaborateurs }) {
  const addCommande = useAppStore((s) => s.addCommande);
  const deleteCommande = useAppStore((s) => s.deleteCommande);
  const [editingCommande, setEditingCommande] = useState(null); // null | 'new' | commandeObj

  const commandes = projet.commandes || [];
  const moisList = getAllMois(projet);

  // Si pas de commandes : vue globale avec tous les collabs
  const collabsGlobaux = getCollabsActifs(projet, collaborateurs, []);
  const hasMonthlyData = moisList.length > 0;

  return (
    <div>
      {/* En-tête avec gestion des commandes */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Suivi de consommation mensuel</h3>
          {!hasMonthlyData && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888780' }}>
              Aucune saisie mensuelle — ajoutez les jours réalisés par mois dans le WBS (panneau détail d'une tâche).
            </p>
          )}
        </div>
        <button onClick={() => setEditingCommande('new')} style={btnPrimStyle}>
          <Plus size={14} style={{ marginRight: 6 }} /> Nouvelle commande
        </button>
      </div>

      {/* Commandes définies */}
      {commandes.length > 0 ? (
        commandes.map((cmd) => (
          <div key={cmd.id} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ background: '#1A1A18', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 5 }}>
                {cmd.numero}
              </div>
              {cmd.notes && <span style={{ fontSize: 12, color: '#888780' }}>{cmd.notes}</span>}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => setEditingCommande(cmd)} style={iconBtn} title="Modifier">
                  <Settings2 size={13} />
                </button>
                <button
                  onClick={() => { if (confirm(`Supprimer la commande ${cmd.numero} ?`)) deleteCommande(projet.id, cmd.id); }}
                  style={{ ...iconBtn, color: '#D85A30' }}
                  title="Supprimer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 10, overflow: 'hidden' }}>
              {moisList.length === 0 ? (
                <p style={{ padding: '20px 16px', margin: 0, fontSize: 12, color: '#888780' }}>
                  Aucune saisie mensuelle trouvée. Saisissez les jours réalisés par mois dans le WBS.
                </p>
              ) : (
                <TableauSuivi
                  projet={projet}
                  commande={cmd}
                  collaborateurs={collaborateurs}
                  moisList={moisList}
                />
              )}
            </div>
          </div>
        ))
      ) : (
        /* Vue globale si pas de commandes */
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 10, overflow: 'hidden' }}>
          {collabsGlobaux.length === 0 ? (
            <p style={{ padding: '32px', textAlign: 'center', color: '#888780', margin: 0 }}>
              Aucun collaborateur affecté dans le WBS.
            </p>
          ) : moisList.length === 0 ? (
            <p style={{ padding: '32px', textAlign: 'center', color: '#888780', margin: 0 }}>
              Saisissez les jours réalisés par mois dans le WBS pour voir le suivi ici.
            </p>
          ) : (
            <TableauSuivi
              projet={projet}
              commande={{ collaborateur_ids: [] }}
              collaborateurs={collaborateurs}
              moisList={moisList}
            />
          )}
        </div>
      )}

      {/* Modales */}
      {editingCommande === 'new' && (
        <Modal title="Nouvelle commande" onClose={() => setEditingCommande(null)} width={480}>
          <ModalCommande projet={projet} collaborateurs={collaborateurs} commande={null} onClose={() => setEditingCommande(null)} />
        </Modal>
      )}
      {editingCommande && editingCommande !== 'new' && (
        <Modal title={`Modifier — ${editingCommande.numero}`} onClose={() => setEditingCommande(null)} width={480}>
          <ModalCommande projet={projet} collaborateurs={collaborateurs} commande={editingCommande} onClose={() => setEditingCommande(null)} />
        </Modal>
      )}
    </div>
  );
}

// ── Onglet Factures ───────────────────────────────────────────────
function ModalCreation({ projet, collaborateurs, onClose }) {
  const addFacture = useAppStore((s) => s.addFacture);
  const today = new Date();
  const defaultMois = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const [mois, setMois] = useState(defaultMois);
  const [lignes, setLignes] = useState([]);
  const [tva, setTva] = useState(projet.facturation_params?.tva ?? 20);
  const [delai, setDelai] = useState(projet.facturation_params?.delai_paiement ?? 30);
  const [refClient, setRefClient] = useState('');
  const [notes, setNotes] = useState('');
  const [generated, setGenerated] = useState(false);

  const dejaFacture = (projet.factures || []).some((f) => f.mois === mois);

  const handleGenerate = () => {
    const parCollab = {};
    projet.wbs.forEach((n) => {
      n.affectations.forEach((a) => {
        const j = a.jours_realises_par_mois?.[mois] || 0;
        if (j > 0) parCollab[a.collaborateur_id] = (parCollab[a.collaborateur_id] || 0) + j;
      });
    });
    const gen = Object.entries(parCollab).map(([id, j]) => {
      const tjm = projet.tjm.find((t) => t.collaborateur_id === id)?.montant || 0;
      const c = collaborateurs.find((x) => x.id === id);
      const nom = c ? `${c.prenom} ${c.nom}` : 'Inconnu';
      return { id: uuidv4(), collaborateur_id: id, collaborateur_nom: nom, jours: j, tjm, montant: j * tjm, description: `${nom} — ${formatMois(mois)}` };
    });
    setLignes(gen);
    setGenerated(true);
  };

  const updateLigne = (id, field, value) => setLignes((prev) => prev.map((l) => {
    if (l.id !== id) return l;
    const u = { ...l, [field]: value };
    u.montant = u.jours * u.tjm;
    return u;
  }));

  const ht = lignes.reduce((s, l) => s + l.montant, 0);
  const ttc = ht * (1 + tva / 100);

  const handleSave = (statut) => {
    const dateEmission = statut === 'emise' ? new Date().toISOString().slice(0, 10) : null;
    const dateEcheance = dateEmission
      ? new Date(new Date(dateEmission).getTime() + delai * 86400000).toISOString().slice(0, 10) : null;
    addFacture(projet.id, { mois, lignes, tva, statut, date_emission: dateEmission, date_echeance: dateEcheance, reference_client: refClient, notes });
    onClose();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <label style={labelStyle}>
          Mois
          <input type="month" style={inputStyle} value={mois} onChange={(e) => { setMois(e.target.value); setGenerated(false); }} />
        </label>
        <label style={{ ...labelStyle, flex: 1 }}>
          Réf. client
          <input style={inputStyle} value={refClient} onChange={(e) => setRefClient(e.target.value)} placeholder="Optionnel" />
        </label>
        <button onClick={handleGenerate} style={btnPrimStyle}>Générer les lignes</button>
      </div>
      {dejaFacture && <p style={{ margin: 0, fontSize: 12, color: '#BA7517', background: '#FFF3CD', padding: '6px 10px', borderRadius: 6 }}>Une facture existe déjà pour ce mois.</p>}
      {generated && (
        <>
          <div style={{ border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#F8F8F7' }}>
                {['Collaborateur', 'Jours', 'TJM', 'Montant', 'Description', ''].map((h) => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#888780', fontWeight: 500 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id} style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
                    <td style={{ padding: '7px 10px' }}><input style={{ ...inputStyle, width: 130 }} value={l.collaborateur_nom} onChange={(e) => updateLigne(l.id, 'collaborateur_nom', e.target.value)} /></td>
                    <td style={{ padding: '7px 10px' }}><input type="number" min={0} step={0.5} style={{ ...inputStyle, width: 58 }} value={l.jours} onChange={(e) => updateLigne(l.id, 'jours', parseFloat(e.target.value) || 0)} /></td>
                    <td style={{ padding: '7px 10px', fontSize: 12, color: '#5F5E5A' }}>{l.tjm > 0 ? `${l.tjm} €/j` : '—'}</td>
                    <td style={{ padding: '7px 10px', fontWeight: 500 }}>{formatCurrency(l.montant)}</td>
                    <td style={{ padding: '7px 10px' }}><input style={{ ...inputStyle, width: 170 }} value={l.description} onChange={(e) => updateLigne(l.id, 'description', e.target.value)} /></td>
                    <td style={{ padding: '7px 6px' }}><button onClick={() => setLignes((p) => p.filter((x) => x.id !== l.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D85A30', padding: 3, display: 'flex' }}><X size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setLignes((p) => [...p, { id: uuidv4(), collaborateur_id: '', collaborateur_nom: '', jours: 1, tjm: 0, montant: 0, description: '' }])}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#5F5E5A' }}>
              <Plus size={12} /> Ajouter une ligne
            </button>
          </div>
          {lignes.length === 0 && generated && <p style={{ margin: 0, fontSize: 12, color: '#888780', textAlign: 'center' }}>Aucune saisie mensuelle pour ce mois — ajoutez des jours dans le WBS ou des lignes manuelles.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <div style={{ display: 'flex', gap: 24 }}><span style={{ fontSize: 13, color: '#5F5E5A' }}>Sous-total HT</span><span style={{ fontSize: 13, fontWeight: 600, width: 100, textAlign: 'right' }}>{formatCurrency(ht)}</span></div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#5F5E5A', display: 'flex', gap: 5, alignItems: 'center' }}>TVA <input type="number" min={0} max={100} style={{ ...inputStyle, width: 48, padding: '3px 6px' }} value={tva} onChange={(e) => setTva(parseFloat(e.target.value) || 0)} /> %</span>
              <span style={{ fontSize: 13, color: '#5F5E5A', width: 100, textAlign: 'right' }}>{formatCurrency(ht * tva / 100)}</span>
            </div>
            <div style={{ display: 'flex', gap: 24, borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 5 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Total TTC</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1D9E75', width: 100, textAlign: 'right' }}>{formatCurrency(ttc)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <label style={labelStyle}>Délai paiement (j)<input type="number" min={0} style={{ ...inputStyle, width: 80 }} value={delai} onChange={(e) => setDelai(parseInt(e.target.value) || 0)} /></label>
          </div>
          <label style={labelStyle}>Notes<textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes libres…" /></label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={btnSecStyle}>Annuler</button>
            <button onClick={() => handleSave('brouillon')} style={btnSecStyle}>Brouillon</button>
            <button onClick={() => handleSave('emise')} style={btnPrimStyle}><Send size={13} style={{ marginRight: 5 }} /> Émettre</button>
          </div>
        </>
      )}
      {!generated && <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button onClick={onClose} style={btnSecStyle}>Annuler</button></div>}
    </div>
  );
}

function OngletFactures({ projet, collaborateurs }) {
  const updateFacture = useAppStore((s) => s.updateFacture);
  const deleteFacture = useAppStore((s) => s.deleteFacture);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const factures = useMemo(
    () => [...(projet.factures || [])].sort((a, b) => b.mois.localeCompare(a.mois)),
    [projet.factures]
  );
  const detail = factures.find((f) => f.id === detailId);

  const totalFacture = factures.filter((f) => f.statut !== 'brouillon').reduce((s, f) => s + montantFacture(f), 0);
  const totalEncaisse = factures.filter((f) => f.statut === 'payee').reduce((s, f) => s + montantFacture(f), 0);
  const enAttente = factures.filter((f) => f.statut === 'emise').reduce((s, f) => s + montantFacture(f), 0);
  const budgetConso = calculerBudgetProjet(projet).conso;

  const handleEmettre = (f) => {
    const date_emission = new Date().toISOString().slice(0, 10);
    const delai = projet.facturation_params?.delai_paiement || 30;
    const date_echeance = new Date(new Date(date_emission).getTime() + delai * 86400000).toISOString().slice(0, 10);
    updateFacture(projet.id, f.id, { statut: 'emise', date_emission, date_echeance });
  };
  const handlePayer = (f) => updateFacture(projet.id, f.id, { statut: 'payee', date_paiement: new Date().toISOString().slice(0, 10) });

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total facturé HT', value: formatCurrency(totalFacture), color: '#1A1A18' },
          { label: 'Encaissé', value: formatCurrency(totalEncaisse), color: '#1D9E75' },
          { label: 'En attente', value: formatCurrency(enAttente), color: '#BA7517' },
          { label: 'Reste à facturer', value: formatCurrency(Math.max(0, budgetConso - totalFacture)), color: '#378ADD' },
        ].map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, color: '#888780', fontWeight: 500 }}>{k.label}</p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Bouton + tableau */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => setShowCreate(true)} style={btnPrimStyle}><Plus size={14} style={{ marginRight: 5 }} /> Nouvelle facture</button>
      </div>
      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F8F8F7', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
            {['# Facture', 'Mois', 'Lignes', 'HT', 'TTC', 'Statut', 'Émission', 'Échéance', ''].map((h) => (
              <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#888780', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {factures.map((f) => {
              const badge = statutBadgeProps(f);
              const retard = isEnRetard(f);
              return (
                <tr key={f.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)', background: retard ? '#FFF9F5' : '' }}>
                  <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 500, fontFamily: 'monospace' }}>{f.numero}</td>
                  <td style={{ padding: '11px 12px', fontSize: 13 }}>{moisCourt(f.mois)}</td>
                  <td style={{ padding: '11px 12px', fontSize: 12, color: '#5F5E5A' }}>{f.lignes.length}</td>
                  <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 500 }}>{formatCurrency(montantFacture(f))}</td>
                  <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 600 }}>{formatCurrency(montantTTC(f))}</td>
                  <td style={{ padding: '11px 12px' }}><Badge label={badge.label} variant={badge.variant} /></td>
                  <td style={{ padding: '11px 12px', fontSize: 12, color: '#5F5E5A' }}>{f.date_emission ? new Date(f.date_emission).toLocaleDateString('fr-FR') : '—'}</td>
                  <td style={{ padding: '11px 12px', fontSize: 12, color: retard ? '#D85A30' : '#5F5E5A', fontWeight: retard ? 600 : 400 }}>{f.date_echeance ? new Date(f.date_echeance).toLocaleDateString('fr-FR') : '—'}</td>
                  <td style={{ padding: '11px 8px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setDetailId(f.id)} style={iconBtn} title="Détail"><Eye size={13} /></button>
                      {f.statut === 'brouillon' && <button onClick={() => handleEmettre(f)} style={iconBtn} title="Émettre"><Send size={13} /></button>}
                      {f.statut === 'emise' && <button onClick={() => handlePayer(f)} style={{ ...iconBtn, color: '#1D9E75' }} title="Marquer payée"><CheckCircle size={13} /></button>}
                      {f.statut === 'brouillon' && <button onClick={() => { if (confirm(`Supprimer ${f.numero} ?`)) deleteFacture(projet.id, f.id); }} style={{ ...iconBtn, color: '#D85A30' }}><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {factures.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#888780' }}>Aucune facture. Cliquez sur "+ Nouvelle facture".</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && <Modal title="Nouvelle facture" onClose={() => setShowCreate(false)} width={680}><ModalCreation projet={projet} collaborateurs={collaborateurs} onClose={() => setShowCreate(false)} /></Modal>}
      {detail && (
        <Modal title={`Facture ${detail.numero}`} onClose={() => setDetailId(null)} width={580}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              {[['Mois', moisCourt(detail.mois)], ['Statut', <Badge label={statutBadgeProps(detail).label} variant={statutBadgeProps(detail).variant} />], ['Émise le', detail.date_emission ? new Date(detail.date_emission).toLocaleDateString('fr-FR') : '—'], ['Échéance', detail.date_echeance ? new Date(detail.date_echeance).toLocaleDateString('fr-FR') : '—'], ['Payée le', detail.date_paiement ? new Date(detail.date_paiement).toLocaleDateString('fr-FR') : '—']].map(([l, v]) => (
                <div key={l}><p style={{ margin: '0 0 2px', fontSize: 11, color: '#888780' }}>{l}</p><p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{v}</p></div>
              ))}
            </div>
            <div style={{ border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#F8F8F7' }}>{['Description', 'Jours', 'TJM', 'Montant HT'].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#888780', fontWeight: 500 }}>{h}</th>)}</tr></thead>
                <tbody>{detail.lignes.map((l) => (
                  <tr key={l.id} style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
                    <td style={{ padding: '8px 12px' }}>{l.description}</td>
                    <td style={{ padding: '8px 12px', color: '#5F5E5A' }}>{l.jours} j</td>
                    <td style={{ padding: '8px 12px', color: '#5F5E5A' }}>{l.tjm > 0 ? `${l.tjm} €/j` : '—'}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{formatCurrency(l.montant)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
              <div style={{ display: 'flex', gap: 24 }}><span style={{ fontSize: 13, color: '#5F5E5A' }}>HT</span><span style={{ fontSize: 13, fontWeight: 600, width: 100, textAlign: 'right' }}>{formatCurrency(montantFacture(detail))}</span></div>
              <div style={{ display: 'flex', gap: 24 }}><span style={{ fontSize: 13, color: '#5F5E5A' }}>TVA ({detail.tva}%)</span><span style={{ fontSize: 13, color: '#5F5E5A', width: 100, textAlign: 'right' }}>{formatCurrency(montantFacture(detail) * detail.tva / 100)}</span></div>
              <div style={{ display: 'flex', gap: 24, borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 5 }}><span style={{ fontSize: 14, fontWeight: 600 }}>TTC</span><span style={{ fontSize: 14, fontWeight: 700, color: '#1D9E75', width: 100, textAlign: 'right' }}>{formatCurrency(montantTTC(detail))}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 10 }}>
              <button onClick={() => setDetailId(null)} style={btnSecStyle}>Fermer</button>
              {detail.statut === 'brouillon' && <button onClick={() => { handleEmettre(detail); setDetailId(null); }} style={btnPrimStyle}><Send size={13} style={{ marginRight: 5 }} /> Émettre</button>}
              {detail.statut === 'emise' && <button onClick={() => { handlePayer(detail); setDetailId(null); }} style={{ ...btnPrimStyle, background: '#1D9E75' }}><CheckCircle size={13} style={{ marginRight: 5 }} /> Marquer payée</button>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────
export default function ProjetFacturation() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const [onglet, setOnglet] = useState('suivi');

  return (
    <div style={{ padding: 32 }}>
      <PageHeader title="Facturation" subtitle={projet.nom} />

      {/* Onglets */}
      <div style={{ display: 'flex', borderBottom: '0.5px solid rgba(0,0,0,0.1)', marginBottom: 24, gap: 0 }}>
        {[
          { key: 'suivi',    label: 'Suivi mensuel' },
          { key: 'factures', label: `Factures (${(projet.factures || []).length})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setOnglet(t.key)}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 500,
              color: onglet === t.key ? '#1A1A18' : '#5F5E5A',
              borderBottom: onglet === t.key ? '2px solid #1A1A18' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {onglet === 'suivi'
        ? <OngletSuivi projet={projet} collaborateurs={collaborateurs} />
        : <OngletFactures projet={projet} collaborateurs={collaborateurs} />
      }
    </div>
  );
}

const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#5F5E5A' };
const inputStyle = { padding: '7px 9px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', background: '#fff' };
const btnPrimStyle = { display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, border: 'none', background: '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecStyle = { display: 'inline-flex', alignItems: 'center', padding: '7px 12px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 13, cursor: 'pointer' };
const iconBtn = { display: 'inline-flex', alignItems: 'center', padding: 5, borderRadius: 5, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', cursor: 'pointer', color: '#5F5E5A' };
