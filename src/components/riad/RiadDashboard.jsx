import { useState } from 'react';
import { Plus, Trash2, Settings2 } from 'lucide-react';
import useAppStore from '../../store/useAppStore';
import {
  PROBABILITE_LEVELS, IMPACT_LEVELS, RIAD_MODULES,
  calculerMatriceRisques, calculerTableauEscalade, calculerSanityCheck, couleurSeverite,
} from '../../utils/riadCalculs';

const cardStyle = { background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, padding: 20, marginBottom: 20 };
const h3Style = { margin: '0 0 14px', fontSize: 14, fontWeight: 600 };
const th = { padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#5F5E5A', textAlign: 'center' };
const td = { padding: '6px 10px', fontSize: 12, textAlign: 'center', border: '1px solid rgba(255,255,255,0.6)' };

function EscaladeEditor({ projet, onClose }) {
  const setEscaladeNiveaux = useAppStore((s) => s.setEscaladeNiveaux);
  const [niveaux, setNiveaux] = useState(projet.escalade_niveaux || []);
  const [nouveau, setNouveau] = useState('');

  const ajouter = () => {
    if (!nouveau.trim()) return;
    setNiveaux((n) => [...n, nouveau.trim()]);
    setNouveau('');
  };
  const retirer = (i) => setNiveaux((n) => n.filter((_, idx) => idx !== i));
  const monter = (i) => { if (i === 0) return; setNiveaux((n) => { const c = [...n]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; }); };
  const descendre = (i) => { if (i === niveaux.length - 1) return; setNiveaux((n) => { const c = [...n]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; return c; }); };

  return (
    <div style={{ ...cardStyle, border: '1px solid #378ADD', background: '#F5FAFF' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ ...h3Style, margin: 0 }}>Niveaux d'escalade du projet</h3>
      </div>
      {niveaux.map((n, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#888780', width: 18 }}>{i + 1}.</span>
          <span style={{ fontSize: 13, flex: 1 }}>{n}</span>
          <button type="button" onClick={() => monter(i)} disabled={i === 0} style={miniBtn}>↑</button>
          <button type="button" onClick={() => descendre(i)} disabled={i === niveaux.length - 1} style={miniBtn}>↓</button>
          <button type="button" onClick={() => retirer(i)} style={{ ...miniBtn, color: '#D85A30' }}><Trash2 size={12} /></button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13 }}
          value={nouveau} onChange={(e) => setNouveau(e.target.value)}
          placeholder="Nom du niveau (ex : COPIL DSI)"
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), ajouter())}
        />
        <button type="button" onClick={ajouter} style={{ ...miniBtn, padding: '6px 10px' }}><Plus size={13} /></button>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" onClick={onClose} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Annuler</button>
        <button
          type="button"
          onClick={() => { setEscaladeNiveaux(projet.id, niveaux); onClose(); }}
          style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function EscaladeTable({ titre, couleur, tableau, noMargin }) {
  return (
    <div style={{ ...cardStyle, ...(noMargin ? { marginBottom: 0 } : {}) }}>
      <div style={{ background: couleur, color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 14px', borderRadius: 6, marginBottom: 12 }}>
        {titre}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Niveau</th>
            {RIAD_MODULES.map((m) => <th key={m.key} style={th}>{m.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {tableau.rows.map((r) => (
            <tr key={r.niveau} style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
              <td style={{ ...td, textAlign: 'left', fontSize: 12.5 }}>{r.niveau}</td>
              {RIAD_MODULES.map((m) => <td key={m.key} style={td}>{r[m.key] || ''}</td>)}
            </tr>
          ))}
          <tr style={{ borderTop: '1px solid rgba(0,0,0,0.1)', fontWeight: 700, background: '#F8F8F7' }}>
            <td style={{ ...td, textAlign: 'left' }}>Total</td>
            {RIAD_MODULES.map((m) => <td key={m.key} style={td}>{tableau.total[m.key]}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function RiadDashboard({ projet }) {
  const [editingEscalade, setEditingEscalade] = useState(false);
  const riad = projet.riad || { risques: [], issues: [], actions: [], decisions: [] };
  const escaladeNiveaux = projet.escalade_niveaux || [];

  const matrice = calculerMatriceRisques(riad.risques || []);
  const ouvert = calculerTableauEscalade(riad, escaladeNiveaux, false);
  const clos = calculerTableauEscalade(riad, escaladeNiveaux, true);
  const sanity = calculerSanityCheck(riad);
  const sanityOk = RIAD_MODULES.every((m) => sanity[m.key] === ouvert.total[m.key] + clos.total[m.key]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => setEditingEscalade((v) => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#5F5E5A' }}
        >
          <Settings2 size={14} /> Niveaux d'escalade
        </button>
      </div>

      {editingEscalade && <EscaladeEditor projet={projet} onClose={() => setEditingEscalade(false)} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ ...cardStyle, marginBottom: 0 }}>
          <h3 style={h3Style}>Matrice des risques (ouverts)</h3>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {[...PROBABILITE_LEVELS].reverse().map((p) => (
                <tr key={p.key}>
                  <td style={{ ...td, textAlign: 'right', paddingRight: 12, fontSize: 11.5, color: '#5F5E5A', whiteSpace: 'nowrap' }}>{p.label}</td>
                  {IMPACT_LEVELS.map((i) => (
                    <td key={i.key} style={{ ...td, background: couleurSeverite(p.valeur, i.valeur), color: '#1A1A18', fontWeight: 700, width: 60, height: 32 }}>
                      {matrice[p.key][i.key]}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td />
                {IMPACT_LEVELS.map((i) => (
                  <td key={i.key} style={{ ...td, fontSize: 10.5, color: '#888780' }}>{i.label}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <EscaladeTable titre="Niveau d'escalade des RIAD — Statut Ouvert" couleur="#D85A30" tableau={ouvert} noMargin />

        <EscaladeTable titre="Niveau d'escalade des RIAD — Statut Closed" couleur="#1D9E75" tableau={clos} noMargin />

        <div style={{ ...cardStyle, marginBottom: 0, borderColor: sanityOk ? 'rgba(0,0,0,0.12)' : '#D85A30' }}>
          <div style={{ background: sanityOk ? '#1A1A18' : '#D85A30', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 14px', borderRadius: 6, marginBottom: 12 }}>
            Sanity check — Total RIAD {sanityOk ? '✓' : '⚠ incohérent'}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{RIAD_MODULES.map((m) => <th key={m.key} style={th}>{m.label}</th>)}</tr>
            </thead>
            <tbody>
              <tr>{RIAD_MODULES.map((m) => <td key={m.key} style={{ ...td, fontWeight: 700 }}>{sanity[m.key]}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const miniBtn = { padding: '4px 8px', borderRadius: 5, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5F5E5A' };
