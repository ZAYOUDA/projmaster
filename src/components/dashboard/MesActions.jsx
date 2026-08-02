import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, CalendarDays, ChevronDown, Eye, EyeOff, Archive } from 'lucide-react';
import useAppStore from '../../store/useAppStore';

// Couleurs alignées sur les variantes déjà définies dans Badge.jsx pour les statuts de tâche WBS
// (non_demarre/en_cours/termine/bloque) afin de rester visuellement cohérent avec le reste de l'app.
const STATUTS = [
  { key: 'a_faire', label: 'À faire', color: 'var(--color-text-tertiary)' },
  { key: 'en_cours', label: 'En cours', color: 'var(--color-info)' },
  { key: 'termine', label: 'Terminé', color: 'var(--color-success)' },
  { key: 'bloque', label: 'Bloqué', color: 'var(--color-danger)' },
];
const COLOR_BY_STATUT = Object.fromEntries(STATUTS.map((s) => [s.key, s.color]));
const LABEL_BY_STATUT = Object.fromEntries(STATUTS.map((s) => [s.key, s.label]));

// toISOString() convertit en UTC : pour un Date à minuit local (fuseau UTC+, ex. France), ça
// retombe sur la veille. On formate donc à partir des composants locaux du Date.
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function isEnRetard(tache) {
  return tache.deadline && tache.statut !== 'termine' && tache.deadline < todayIso();
}

// Liste déroulante générique (« pick list ») — un bouton déclencheur + un menu qui se ferme au
// clic en dehors. Utilisée à la fois pour le statut d'une tâche et pour le filtre global.
// Le menu est rendu dans un portail avec un positionnement `fixed` calculé depuis le bouton :
// ça évite qu'un ancêtre avec overflow (ex. la liste d'actions scrollable) ne le rogne.
function Picklist({ trigger, options, value, onChange, align = 'left', minWidth = 110 }) {
  const [ouvert, setOuvert] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!ouvert) return;
    const onClickOutside = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOuvert(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [ouvert]);

  // Position calculée dans un effet (jamais pendant le render) une fois le menu ouvert.
  useLayoutEffect(() => {
    if (!ouvert || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({
      top: r.bottom + 4,
      left: align === 'left' ? r.left : undefined,
      right: align === 'right' ? window.innerWidth - r.right : undefined,
    });
  }, [ouvert, align]);

  const toggle = () => setOuvert((v) => !v);

  return (
    <span ref={btnRef} style={{ display: 'inline-flex', flexShrink: 0 }}>
      {trigger(toggle, ouvert)}
      {ouvert && pos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, right: pos.right, zIndex: 1000,
            background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 8,
            boxShadow: '0 4px 16px var(--color-shadow)', overflow: 'hidden', minWidth,
          }}
        >
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => { onChange(o.key); setOuvert(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%', whiteSpace: 'nowrap',
                padding: '7px 10px', border: 'none', background: value === o.key ? 'var(--color-bg-secondary)' : 'var(--color-bg-card)',
                cursor: 'pointer', fontSize: 12, color: 'var(--color-text-primary)', textAlign: 'left',
              }}
            >
              {o.color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: o.color, flexShrink: 0 }} />}
              {o.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </span>
  );
}

function StatutPicker({ value, onChange }) {
  const statut = STATUTS.find((s) => s.key === value) || STATUTS[0];
  return (
    <Picklist
      value={value}
      onChange={onChange}
      options={STATUTS}
      minWidth={110}
      trigger={(toggle) => (
        <button
          type="button"
          onClick={toggle}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 10.5, fontWeight: 500, borderRadius: 99, padding: '2px 7px',
            border: `0.5px solid ${statut.color}`, background: 'var(--color-bg-card)', color: statut.color, cursor: 'pointer',
          }}
        >
          {statut.label}
          <ChevronDown size={10} />
        </button>
      )}
    />
  );
}

// Picklist de filtre (Toutes / À faire / En cours / Terminé / Bloqué) — remplace la rangée de
// boutons pills par un unique menu déroulant, avec le compte par statut.
function FiltrePicker({ value, onChange, taches }) {
  const options = ['toutes', ...STATUTS.map((s) => s.key)].map((key) => ({
    key,
    color: key === 'toutes' ? null : COLOR_BY_STATUT[key],
    label: `${key === 'toutes' ? 'Toutes' : LABEL_BY_STATUT[key]} (${
      key === 'toutes' ? taches.length : taches.filter((t) => t.statut === key).length
    })`,
  }));
  const actif = options.find((o) => o.key === value) || options[0];

  return (
    <Picklist
      value={value}
      onChange={onChange}
      options={options}
      minWidth={150}
      trigger={(toggle) => (
        <button
          type="button"
          onClick={toggle}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', fontSize: 11, fontWeight: 500, borderRadius: 99, cursor: 'pointer',
            border: '0.5px solid var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text-secondary)',
          }}
        >
          {actif.color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: actif.color, flexShrink: 0 }} />}
          {actif.label}
          <ChevronDown size={11} />
        </button>
      )}
    />
  );
}

// Saisie compacte : icône + champ titre + icône calendrier (date pré-remplie à aujourd'hui,
// modifiable en cliquant sur l'icône avant de valider).
function AjoutTache({ onAjouter }) {
  const [titre, setTitre] = useState('');
  const [deadline, setDeadline] = useState(todayIso());
  const [dateOuverte, setDateOuverte] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!titre.trim()) return;
    onAjouter({ titre: titre.trim(), deadline });
    setTitre('');
    setDeadline(todayIso());
    setDateOuverte(false);
  };

  return (
    <form onSubmit={submit} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      border: '0.5px solid var(--color-border)', borderRadius: 10, padding: '8px 10px', marginBottom: 10,
    }}>
      <Plus size={16} color="var(--color-text-tertiary)" style={{ flexShrink: 0 }} />
      <input
        type="text" value={titre} onChange={(e) => setTitre(e.target.value)}
        placeholder="Nouvelle action…"
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 13, background: 'transparent' }}
      />
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setDateOuverte((v) => !v)}
          title={new Date(deadline).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 8, border: 'none',
            background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', cursor: 'pointer',
          }}
        >
          <CalendarDays size={14} />
        </button>
        {dateOuverte && (
          <input
            type="date" value={deadline} autoFocus
            onChange={(e) => setDeadline(e.target.value)}
            onBlur={() => setDateOuverte(false)}
            style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20,
              padding: '6px 8px', fontSize: 12, borderRadius: 8, border: '0.5px solid var(--color-border)',
              background: 'var(--color-bg-card)',
            }}
          />
        )}
      </div>
    </form>
  );
}

// Bloc compact pour la colonne droite du Dashboard (~340px) — empile les éléments plutôt que
// de les aligner horizontalement, pour rester lisible dans une colonne étroite.
export default function MesActions() {
  const taches = useAppStore((s) => s.taches);
  const addTache = useAppStore((s) => s.addTache);
  const updateTache = useAppStore((s) => s.updateTache);
  const deleteTache = useAppStore((s) => s.deleteTache);

  const [filtre, setFiltre] = useState('toutes');
  const [afficherTerminees, setAfficherTerminees] = useState(false);

  const tachesTerminees = taches.filter((t) => t.statut === 'termine');

  const visibles = taches
    .filter((t) => filtre === 'toutes' || t.statut === filtre)
    // Les terminées restent masquées en vue "Toutes" tant qu'on ne les a pas explicitement
    // révélées — sauf si on filtre spécifiquement sur "Terminé", où les montrer est le but.
    .filter((t) => filtre === 'termine' || afficherTerminees || t.statut !== 'termine')
    .sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    });

  const handleArchiver = () => {
    if (tachesTerminees.length === 0) return;
    const ok = window.confirm(
      `Archiver ${tachesTerminees.length} action${tachesTerminees.length > 1 ? 's' : ''} terminée${tachesTerminees.length > 1 ? 's' : ''} ? ` +
      'Archiver = supprimer définitivement, cette action est irréversible.'
    );
    if (!ok) return;
    tachesTerminees.forEach((t) => deleteTache(t.id));
  };

  return (
    <>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Mes actions</h3>
      <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, marginBottom: 24 }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-soft)' }}>
          <AjoutTache onAjouter={addTache} />

          {/* Filtre — picklist unique plutôt qu'une rangée de boutons */}
          <FiltrePicker value={filtre} onChange={setFiltre} taches={taches} />

          {/* Terminées masquées par défaut — révélables, avec option d'archivage (= suppression) */}
          {tachesTerminees.length > 0 && filtre !== 'termine' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => setAfficherTerminees((v) => !v)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none',
                  cursor: 'pointer', padding: 0, fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500,
                }}
              >
                {afficherTerminees ? <EyeOff size={12} /> : <Eye size={12} />}
                {afficherTerminees ? 'Masquer' : 'Afficher'} les terminées ({tachesTerminees.length})
              </button>
              {afficherTerminees && (
                <button
                  onClick={handleArchiver}
                  title="Supprime définitivement les actions terminées"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none',
                    cursor: 'pointer', padding: 0, fontSize: 11, color: 'var(--color-danger)', fontWeight: 500,
                  }}
                >
                  <Archive size={12} /> Archiver
                </button>
              )}
            </div>
          )}
        </div>

        {visibles.length === 0 && (
          <p style={{ padding: '18px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)', margin: 0, fontSize: 12 }}>
            Aucune action{filtre !== 'toutes' ? ` "${LABEL_BY_STATUT[filtre]}"` : ''}.
          </p>
        )}

        {/* Limité à ~5 lignes visibles, scroll interne au-delà pour ne pas allonger la carte */}
        <div style={{ maxHeight: visibles.length > 5 ? 5 * 41 : 'none', overflowY: visibles.length > 5 ? 'auto' : 'visible' }}>
          {visibles.map((t, i) => {
            const retard = isEnRetard(t);
            return (
              <div
                key={t.id}
                style={{
                  padding: '9px 16px',
                  borderBottom: i < visibles.length - 1 ? '0.5px solid var(--color-border-soft)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLOR_BY_STATUT[t.statut], flexShrink: 0 }} />
                <span style={{
                  flex: 1, fontSize: 13, color: 'var(--color-text-primary)', minWidth: 0,
                  textDecoration: t.statut === 'termine' ? 'line-through' : 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.titre}
                </span>
                {t.deadline && (
                  <span style={{ fontSize: 11, fontWeight: retard ? 600 : 400, color: retard ? 'var(--color-danger)' : 'var(--color-text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {retard && '⚠ '}{new Date(t.deadline).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </span>
                )}
                <StatutPicker value={t.statut} onChange={(statut) => updateTache(t.id, { statut })} />
                <button
                  onClick={() => deleteTache(t.id)}
                  title="Supprimer"
                  style={{
                    border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)',
                    fontSize: 15, lineHeight: 1, padding: 0, flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
