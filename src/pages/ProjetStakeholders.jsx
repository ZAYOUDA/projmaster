import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, LayoutGrid, List } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import PageHeader from '../components/layout/PageHeader';
import Badge from '../components/ui/Badge';

// ── Constantes ───────────────────────────────────────────────────
const FREQUENCES = [
  { value: 'quotidien',    label: 'Quotidien' },
  { value: 'hebdomadaire', label: 'Hebdomadaire' },
  { value: 'bimensuel',    label: 'Bimensuel' },
  { value: 'mensuel',      label: 'Mensuel' },
  { value: 'trimestriel',  label: 'Trimestriel' },
];

const QUADRANT_META = {
  gerer_activement: { label: 'Gérer activement', color: '#D85A30', bg: '#FFF4F0', desc: 'Communication proactive, alignement régulier' },
  garder_satisfait: { label: 'Garder satisfait',  color: '#BA7517', bg: '#FFFBEB', desc: 'Tenir informé des grandes décisions' },
  informer:         { label: 'Informer',           color: '#378ADD', bg: '#EFF6FF', desc: 'Mises à jour régulières sans surinvestissement' },
  surveiller:       { label: 'Surveiller',         color: '#888780', bg: '#F8F8F7', desc: 'Monitoring minimal' },
};

// ── Score stars ──────────────────────────────────────────────────
function ScoreSelect({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          style={{
            width: 18, height: 18, borderRadius: 3, border: 'none', cursor: 'pointer',
            background: n <= value ? '#1A1A18' : '#E8E7E3',
            fontSize: 0,
          }}
          title={`${n}`}
        />
      ))}
    </div>
  );
}

// ── Cellule éditable inline ───────────────────────────────────────
function EditCell({ value, onSave, multiline, placeholder, width }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (!editing) {
    return (
      <div
        onClick={() => { setDraft(value); setEditing(true); setTimeout(() => ref.current?.focus(), 0); }}
        style={{
          minHeight: 22, cursor: 'text', padding: '3px 6px', borderRadius: 5,
          fontSize: 12, color: value ? '#1A1A18' : '#BDBCB8', lineHeight: 1.4,
          width: width || '100%',
          transition: 'background 0.1s',
          wordBreak: 'break-word',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#F1EFE8'}
        onMouseLeave={(e) => e.currentTarget.style.background = ''}
      >
        {value || placeholder || <span style={{ fontStyle: 'italic' }}>—</span>}
      </div>
    );
  }

  const commonStyle = {
    width: '100%', padding: '4px 6px', borderRadius: 5, border: '1.5px solid #378ADD',
    fontSize: 12, outline: 'none', fontFamily: 'inherit', lineHeight: 1.4,
    resize: multiline ? 'vertical' : 'none', minHeight: multiline ? 64 : undefined,
  };

  return multiline ? (
    <textarea
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      style={commonStyle}
      placeholder={placeholder}
    />
  ) : (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      style={commonStyle}
      placeholder={placeholder}
    />
  );
}

// ── Vue Tableau ───────────────────────────────────────────────────
function VueTableau({ projet, stakeholders }) {
  const addStakeholder = useAppStore((s) => s.addStakeholder);
  const updateStakeholder = useAppStore((s) => s.updateStakeholder);
  const deleteStakeholder = useAppStore((s) => s.deleteStakeholder);

  const upd = (id, field, val) => updateStakeholder(projet.id, id, { [field]: val });

  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead>
            <tr style={{ background: '#F8F8F7', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
              {['Rôle', 'Nom', 'Influence', 'Intérêt', 'Définition du succès', 'Stratégie communication', 'Notes empathie', 'Fréquence contact', 'Quadrant', 'Dernière interaction', ''].map((h) => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#888780', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stakeholders.map((sh) => {
              const qm = QUADRANT_META[sh.quadrant] || QUADRANT_META.surveiller;
              return (
                <tr key={sh.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)', verticalAlign: 'top' }}>
                  {/* Rôle */}
                  <td style={{ padding: '8px 4px', minWidth: 130 }}>
                    <EditCell value={sh.role} onSave={(v) => upd(sh.id, 'role', v)} placeholder="Ex: Project Sponsor" />
                  </td>
                  {/* Nom */}
                  <td style={{ padding: '8px 4px', minWidth: 100 }}>
                    <EditCell value={sh.nom} onSave={(v) => upd(sh.id, 'nom', v)} placeholder="Optionnel" />
                  </td>
                  {/* Influence */}
                  <td style={{ padding: '10px 12px', minWidth: 110 }}>
                    <ScoreSelect value={sh.influence} onChange={(v) => upd(sh.id, 'influence', v)} />
                    <span style={{ fontSize: 10, color: '#888780' }}>{sh.influence}/5</span>
                  </td>
                  {/* Intérêt */}
                  <td style={{ padding: '10px 12px', minWidth: 110 }}>
                    <ScoreSelect value={sh.interet} onChange={(v) => upd(sh.id, 'interet', v)} />
                    <span style={{ fontSize: 10, color: '#888780' }}>{sh.interet}/5</span>
                  </td>
                  {/* Success definition */}
                  <td style={{ padding: '8px 4px', minWidth: 180 }}>
                    <EditCell value={sh.success_definition} onSave={(v) => upd(sh.id, 'success_definition', v)} multiline placeholder="Comment définit-il le succès du projet ?" />
                  </td>
                  {/* Communication strategy */}
                  <td style={{ padding: '8px 4px', minWidth: 180 }}>
                    <EditCell value={sh.communication_strategy} onSave={(v) => upd(sh.id, 'communication_strategy', v)} multiline placeholder="Comment cadrer les données pour ce stakeholder ?" />
                  </td>
                  {/* Empathy notes */}
                  <td style={{ padding: '8px 4px', minWidth: 180 }}>
                    <EditCell value={sh.empathy_notes} onSave={(v) => upd(sh.id, 'empathy_notes', v)} multiline placeholder="Préoccupations, patterns de pensée…" />
                  </td>
                  {/* Fréquence */}
                  <td style={{ padding: '8px 12px', minWidth: 130 }}>
                    <select
                      value={sh.checkin_frequency}
                      onChange={(e) => upd(sh.id, 'checkin_frequency', e.target.value)}
                      style={{ fontSize: 12, padding: '4px 8px', borderRadius: 5, border: '1px solid rgba(0,0,0,0.15)', outline: 'none', background: '#fff', cursor: 'pointer' }}
                    >
                      {FREQUENCES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </td>
                  {/* Quadrant */}
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500,
                      background: qm.bg, color: qm.color, whiteSpace: 'nowrap',
                    }}>
                      {qm.label}
                    </span>
                  </td>
                  {/* Dernière interaction */}
                  <td style={{ padding: '8px 12px', minWidth: 140 }}>
                    <input
                      type="date"
                      value={sh.derniere_interaction || ''}
                      onChange={(e) => upd(sh.id, 'derniere_interaction', e.target.value || null)}
                      style={{ fontSize: 12, padding: '4px 6px', borderRadius: 5, border: '1px solid rgba(0,0,0,0.15)', outline: 'none' }}
                    />
                  </td>
                  {/* Actions */}
                  <td style={{ padding: '8px 8px' }}>
                    <button
                      onClick={() => { if (confirm(`Supprimer ${sh.role || 'ce stakeholder'} ?`)) deleteStakeholder(projet.id, sh.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D85A30', padding: 4, display: 'flex' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {stakeholders.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: 48, textAlign: 'center', color: '#888780', fontSize: 13 }}>
                  Aucune partie prenante. Cliquez sur "+ Ajouter un stakeholder".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Vue Matrice ───────────────────────────────────────────────────
function VueMatrice({ stakeholders }) {
  const [tooltip, setTooltip] = useState(null);

  const quadrants = [
    { key: 'garder_satisfait', row: 1, col: 1, label: 'Garder satisfait', sub: 'Influence élevée · Intérêt faible' },
    { key: 'gerer_activement', row: 1, col: 2, label: 'Gérer activement', sub: 'Influence élevée · Intérêt élevé' },
    { key: 'surveiller',       row: 2, col: 1, label: 'Surveiller',       sub: 'Influence faible · Intérêt faible' },
    { key: 'informer',         row: 2, col: 2, label: 'Informer',         sub: 'Influence faible · Intérêt élevé' },
  ];

  return (
    <div style={{ position: 'relative' }}>
      {/* Axes labels */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.08em', height: 120 }}>
            ← Influence →
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {/* Intérêt labels */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8, paddingLeft: 2, paddingRight: 2 }}>
            <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Intérêt faible</div>
            <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Intérêt élevé</div>
          </div>
          {/* Influence high row label */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* row 1 = influence haute */}
            {['garder_satisfait', 'gerer_activement'].map((key) => {
              const qm = QUADRANT_META[key];
              const items = stakeholders.filter((sh) => sh.quadrant === key);
              return (
                <div
                  key={key}
                  style={{
                    background: qm.bg, borderRadius: 12, padding: 16, minHeight: 160,
                    borderLeft: `4px solid ${qm.color}`,
                    border: `0.5px solid ${qm.color}30`, borderLeftWidth: 4,
                  }}
                >
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: qm.color }}>{qm.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888780' }}>{qm.desc}</p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {items.map((sh) => (
                      <div
                        key={sh.id}
                        onMouseEnter={() => setTooltip(sh.id)}
                        onMouseLeave={() => setTooltip(null)}
                        style={{
                          position: 'relative',
                          padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                          background: '#fff', border: `1px solid ${qm.color}40`, color: qm.color,
                          cursor: 'default',
                        }}
                      >
                        {sh.role}{sh.nom ? ` · ${sh.nom}` : ''}
                        {tooltip === sh.id && sh.success_definition && (
                          <div style={{
                            position: 'absolute', bottom: '110%', left: 0, zIndex: 99,
                            background: '#1A1A18', color: '#fff', borderRadius: 8, padding: '8px 12px',
                            fontSize: 11, width: 220, lineHeight: 1.5, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                          }}>
                            <strong>{sh.role}</strong>
                            {sh.nom && <> · {sh.nom}</>}
                            <br />
                            <span style={{ color: '#aaa', fontSize: 10 }}>Succès :</span> {sh.success_definition.slice(0, 100)}{sh.success_definition.length > 100 ? '…' : ''}
                            <br />
                            <span style={{ color: '#aaa', fontSize: 10 }}>Contact :</span> {FREQUENCES.find((f) => f.value === sh.checkin_frequency)?.label}
                          </div>
                        )}
                      </div>
                    ))}
                    {items.length === 0 && (
                      <span style={{ fontSize: 11, color: '#BDBCB8', fontStyle: 'italic' }}>Aucun stakeholder</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            {/* row 2 = influence faible */}
            {['surveiller', 'informer'].map((key) => {
              const qm = QUADRANT_META[key];
              const items = stakeholders.filter((sh) => sh.quadrant === key);
              return (
                <div
                  key={key}
                  style={{
                    background: qm.bg, borderRadius: 12, padding: 16, minHeight: 140,
                    border: `0.5px solid ${qm.color}30`, borderLeftWidth: 4, borderLeftColor: qm.color, borderLeftStyle: 'solid',
                  }}
                >
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: qm.color }}>{qm.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888780' }}>{qm.desc}</p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {items.map((sh) => (
                      <div
                        key={sh.id}
                        onMouseEnter={() => setTooltip(sh.id)}
                        onMouseLeave={() => setTooltip(null)}
                        style={{
                          position: 'relative',
                          padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                          background: '#fff', border: `1px solid ${qm.color}40`, color: qm.color,
                          cursor: 'default',
                        }}
                      >
                        {sh.role}{sh.nom ? ` · ${sh.nom}` : ''}
                        {tooltip === sh.id && sh.success_definition && (
                          <div style={{
                            position: 'absolute', top: '110%', left: 0, zIndex: 99,
                            background: '#1A1A18', color: '#fff', borderRadius: 8, padding: '8px 12px',
                            fontSize: 11, width: 220, lineHeight: 1.5, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                          }}>
                            <strong>{sh.role}</strong>
                            {sh.nom && <> · {sh.nom}</>}
                            <br />
                            <span style={{ color: '#aaa', fontSize: 10 }}>Succès :</span> {sh.success_definition.slice(0, 100)}{sh.success_definition.length > 100 ? '…' : ''}
                            <br />
                            <span style={{ color: '#aaa', fontSize: 10 }}>Contact :</span> {FREQUENCES.find((f) => f.value === sh.checkin_frequency)?.label}
                          </div>
                        )}
                      </div>
                    ))}
                    {items.length === 0 && (
                      <span style={{ fontSize: 11, color: '#BDBCB8', fontStyle: 'italic' }}>Aucun stakeholder</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Légende */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24, padding: '16px', background: '#F8F8F7', borderRadius: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#888780', width: '100%' }}>Légende</span>
        {Object.entries(QUADRANT_META).map(([key, qm]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: qm.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#5F5E5A' }}><strong style={{ color: qm.color }}>{qm.label}</strong> — {qm.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────
export default function ProjetStakeholders() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const addStakeholder = useAppStore((s) => s.addStakeholder);
  const [vue, setVue] = useState('tableau');

  const stakeholders = (projet.stakeholders || [])
    .filter((sh) => sh.statut === 'actif')
    .sort((a, b) => a.ordre - b.ordre);

  const handleAdd = () => {
    addStakeholder(projet.id, { role: '', ordre: stakeholders.length + 1 });
  };

  return (
    <div style={{ padding: 32 }}>
      <PageHeader
        title="Parties prenantes"
        subtitle={`${stakeholders.length} stakeholder${stakeholders.length > 1 ? 's' : ''}`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ display: 'flex', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 7, overflow: 'hidden' }}>
              <button
                onClick={() => setVue('tableau')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 13, background: vue === 'tableau' ? '#1A1A18' : '#fff', color: vue === 'tableau' ? '#fff' : '#5F5E5A' }}
              >
                <List size={14} /> Tableau
              </button>
              <button
                onClick={() => setVue('matrice')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 13, background: vue === 'matrice' ? '#1A1A18' : '#fff', color: vue === 'matrice' ? '#fff' : '#5F5E5A', borderLeft: '1px solid rgba(0,0,0,0.12)' }}
              >
                <LayoutGrid size={14} /> Matrice
              </button>
            </div>
            {vue === 'tableau' && (
              <button onClick={handleAdd} style={btnPrimStyle}>
                <Plus size={14} style={{ marginRight: 6 }} /> Ajouter un stakeholder
              </button>
            )}
          </div>
        }
      />

      {vue === 'tableau'
        ? <VueTableau projet={projet} stakeholders={stakeholders} />
        : <VueMatrice stakeholders={stakeholders} />
      }
    </div>
  );
}

const btnPrimStyle = { display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, border: 'none', background: '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
