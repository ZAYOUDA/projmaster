import { useRef } from 'react';
import useAppStore from '../store/useAppStore';
import { useAuth } from '../hooks/useAuth';
import PageHeader from '../components/layout/PageHeader';
import { exportData, importData } from '../data/storage';
import { defaultData } from '../data/defaultData';
import { Download, Upload, Trash2, FolderInput } from 'lucide-react';

const DB_ID = import.meta.env.VITE_FIRESTORE_DB_ID || 'default';

export default function Parametres() {
  const { collaborateurs, projets, savedAt, importAll, importProjet } = useAppStore();
  const { hasFullAccess } = useAuth();
  const fileRef = useRef();
  const projetFileRef = useRef();

  const handleExport = () => exportData({ collaborateurs, projets });

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importData(file);
      if (confirm('Cette action remplacera toutes les données actuelles. Continuer ?')) {
        importAll(data);
        alert('Données importées avec succès.');
      }
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
    e.target.value = '';
  };

  // Import d'un seul projet (fichier généré par "Exporter ce projet" dans Paramètres du projet) —
  // typiquement pour recopier un projet de dev/sandbox vers prod. On avertit toujours sur la base
  // cible (DB_ID) et sur les collaborateurs référencés dans le projet mais absents de cette base,
  // car le WBS/TJM/commandes garderont leurs id d'origine tels quels (pas de remappage auto).
  const handleImportProjet = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importData(file);
      const projetData = data?.projet || data;
      if (!projetData?.id || !projetData?.wbs) {
        throw new Error('Ce fichier ne ressemble pas à un export de projet (utilisez "Exporter ce projet" depuis les Paramètres du projet).');
      }
      const refs = data?.collaborateursReferences || [];
      const manquants = refs.filter((r) => !collaborateurs.some((c) => c.id === r.id));
      const existeDeja = projets.some((p) => p.id === projetData.id);

      const lignes = [
        `Base cible : ${DB_ID}`,
        `Projet : "${projetData.nom}" (${projetData.type || 'BUILD'})`,
        existeDeja ? '⚠️ Un projet avec le même id existe déjà ici — il sera écrasé.' : 'Nouveau projet dans cette base.',
        manquants.length > 0
          ? `⚠️ ${manquants.length} collaborateur(s) référencé(s) dans ce projet sont absents de cette base : ${manquants.map((m) => m.nom || m.id).join(', ')}. Leurs affectations/TJM resteront rattachés à un id introuvable tant qu'ils ne sont pas créés ici.`
          : 'Tous les collaborateurs référencés existent dans cette base.',
        '',
        'Importer ce projet ?',
      ];
      if (confirm(lignes.join('\n'))) {
        await importProjet(projetData);
        alert('Projet importé avec succès.');
      }
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
    e.target.value = '';
  };

  const handleReset = () => {
    if (confirm('Remettre toutes les données d\'exemple ? Cette action effacera tout.')) {
      importAll(defaultData);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 640 }}>
      <PageHeader title="Paramètres" />

      <section style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Export / Import des données</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Sauvegardez vos données dans un fichier JSON ou restaurez une sauvegarde précédente.
          {savedAt && <span> Dernière sauvegarde : {new Date(savedAt).toLocaleString('fr-FR')}.</span>}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleExport} style={btnStyle}>
            <Download size={14} /> Exporter JSON
          </button>
          <button onClick={() => fileRef.current.click()} style={btnSecStyle}>
            <Upload size={14} /> Importer JSON
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        </div>
      </section>

      {hasFullAccess && (
        <section style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Importer un projet</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Importe un fichier généré par « Exporter ce projet » (Paramètres d'un projet) — utile pour recopier
            un projet d'une base vers une autre (ex. dev/sandbox vers prod).
          </p>
          <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Base de données actuelle : <strong style={{ color: 'var(--color-text-secondary)' }}>{DB_ID}</strong> — c'est cette base qui recevra le projet importé.
          </p>
          <button onClick={() => projetFileRef.current.click()} style={btnSecStyle}>
            <FolderInput size={14} /> Importer un projet (JSON)
          </button>
          <input ref={projetFileRef} type="file" accept=".json" onChange={handleImportProjet} style={{ display: 'none' }} />
        </section>
      )}

      <section style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, padding: 24 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Données d'exemple</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Réinitialiser avec le jeu de données d'exemple ({collaborateurs.length} collaborateurs, {projets.length} projets actuellement).
        </p>
        <button onClick={handleReset} style={{ ...btnStyle, background: 'var(--color-critical-soft)', color: 'var(--color-critical)', gap: 6 }}>
          <Trash2 size={14} /> Réinitialiser
        </button>
      </section>
    </div>
  );
}

const btnStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecStyle = { ...btnStyle, background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' };
