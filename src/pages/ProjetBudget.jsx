import { useParams } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { calculerBudgetNoeud, formatCurrency } from '../data/calculations';
import PageHeader from '../components/layout/PageHeader';
import Avatar from '../components/ui/Avatar';
import ProgressBar from '../components/ui/ProgressBar';

export default function ProjetBudget() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const collaborateurs = useAppStore((s) => s.collaborateurs);

  const livrables = projet.wbs.filter((n) => n.parent_id === null).sort((a, b) => a.ordre - b.ordre);
  const totalPrev = livrables.reduce((s, n) => s + calculerBudgetNoeud(n, projet.wbs, projet.tjm).prev, 0);
  const totalConso = livrables.reduce((s, n) => s + calculerBudgetNoeud(n, projet.wbs, projet.tjm).conso, 0);

  // Charge par collaborateur
  const chargeCollab = projet.tjm.map((t) => {
    const c = collaborateurs.find((x) => x.id === t.collaborateur_id);
    if (!c) return null;
    const affs = projet.wbs.flatMap((n) => n.affectations.filter((a) => a.collaborateur_id === t.collaborateur_id));
    const joursPrev = affs.reduce((s, a) => s + a.jours_prev, 0);
    const joursReels = affs.reduce((s, a) => s + a.jours_realises, 0);
    return { ...c, tjm: t.montant, joursPrev, joursReels, coutPrev: joursPrev * t.montant, coutReel: joursReels * t.montant };
  }).filter(Boolean);

  return (
    <div style={{ padding: 32 }}>
      <PageHeader title="Budget & Charge" />

      {/* Budget livrables */}
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Budget par livrable</h3>
      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden', marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8F8F7', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
              {['Livrable', 'Budget prév.', 'Budget conso.', 'Reste', '% consommé'].map((h) => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#888780' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {livrables.map((n) => {
              const b = calculerBudgetNoeud(n, projet.wbs, projet.tjm);
              const pct = b.prev > 0 ? Math.round(b.conso / b.prev * 100) : 0;
              return (
                <tr key={n.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500 }}>{n.nom}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>{formatCurrency(b.prev)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: b.conso > b.prev ? '#D85A30' : '#1A1A18' }}>{formatCurrency(b.conso)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#5F5E5A' }}>{formatCurrency(b.reste)}</td>
                  <td style={{ padding: '12px 16px', width: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ProgressBar value={pct} />
                      <span style={{ fontSize: 12, color: '#5F5E5A', flexShrink: 0 }}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: '#F8F8F7', fontWeight: 600 }}>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>Total</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{formatCurrency(totalPrev)}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: totalConso > totalPrev ? '#D85A30' : '#1A1A18' }}>{formatCurrency(totalConso)}</td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{formatCurrency(totalPrev - totalConso)}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: '#5F5E5A' }}>
                {totalPrev > 0 ? `${Math.round(totalConso / totalPrev * 100)}%` : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Charge collaborateurs */}
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Charge par collaborateur</h3>
      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8F8F7', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
              {['Collaborateur', 'Profil', 'TJM', 'J. prév.', 'J. réels', 'Coût prév.', 'Coût réel'].map((h) => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#888780' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chargeCollab.map((c) => (
              <tr key={c.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar collaborateur={c} size={28} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{c.prenom} {c.nom}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#5F5E5A' }}>{c.profil}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#5F5E5A' }}>{c.tjm} €</td>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.joursPrev} j</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#5F5E5A' }}>{c.joursReels} j</td>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>{formatCurrency(c.coutPrev)}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: c.coutReel > c.coutPrev ? '#D85A30' : '#5F5E5A' }}>{formatCurrency(c.coutReel)}</td>
              </tr>
            ))}
            {chargeCollab.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#888780' }}>Aucune affectation sur ce projet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
