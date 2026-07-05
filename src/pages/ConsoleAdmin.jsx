import { useState } from 'react';
import useAppStore from '../store/useAppStore';
import { createUserAccount, changeUserPassword } from '../firebase/auth';
import PageHeader from '../components/layout/PageHeader';
import Modal from '../components/ui/Modal';
import { Plus, Shield, User, UserCheck, UserX, Key, Lock } from 'lucide-react';

const COLORS = ['#378ADD', '#1D9E75', '#D85A30', '#BA7517', '#8B5CF6', '#EC4899', '#0EA5E9', '#14B8A6'];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

const ROLE_META = {
  admin: { label: 'Admin', bg: '#DBEAFE', color: '#1D4ED8' },
  collaborateur: { label: 'Collaborateur', bg: '#F1EFE8', color: '#5F5E5A' },
};

// ── Modal création utilisateur ───────────────────────────────────
function CreateUserModal({ projets, collaborateurs, onClose, onLoadingChange }) {
  const addCollaborateur = useAppStore((s) => s.addCollaborateur);
  const updateCollaborateur = useAppStore((s) => s.updateCollaborateur);
  const [form, setForm] = useState({
    prenom: '', nom: '', email: '', password: '', role: 'collaborateur',
    collaborateur_id: '', projets_autorises: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setLoadingSync = (v) => { setLoading(v); onLoadingChange?.(v); };

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleProjet = (pid) => setForm((f) => ({
    ...f,
    projets_autorises: f.projets_autorises.includes(pid)
      ? f.projets_autorises.filter((id) => id !== pid)
      : [...f.projets_autorises, pid],
  }));

  const handleCreate = async () => {
    if (!form.prenom.trim() || !form.nom.trim() || !form.email.trim() || !form.password.trim()) {
      setError('Tous les champs marqués * sont obligatoires.');
      return;
    }
    if (form.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    setLoadingSync(true);
    setError('');
    try {
      let collabId = form.collaborateur_id;

      if (form.role === 'collaborateur') {
        if (collabId) {
          // Lier le compte à un collaborateur existant (user_id sera mis à jour après)
        } else {
          // Créer automatiquement un profil collaborateur
          const newCollab = await addCollaborateur({
            prenom: form.prenom.trim(),
            nom: form.nom.trim(),
            couleur: randomColor(),
            tjm: 0,
            poste: '',
          });
          collabId = newCollab.id;
        }
      }

      const result = await createUserAccount(form.email.trim(), form.password, {
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        role: form.role,
        collaborateur_id: collabId || '',
        projets_autorises: form.role === 'collaborateur' ? form.projets_autorises : [],
      });

      // Lier le collaborateur à ce compte Firebase (user_id)
      if (collabId) {
        await updateCollaborateur(collabId, { user_id: result.uid });
      }

      onClose();
    } catch (e) {
      setError(e.code === 'auth/email-already-in-use'
        ? 'Cet email est déjà utilisé.'
        : `Erreur : ${e.message}`);
    } finally {
      setLoadingSync(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={labelStyle}>Prénom *
          <input style={inputStyle} value={form.prenom} onChange={(e) => upd('prenom', e.target.value)} placeholder="Jean" autoFocus />
        </label>
        <label style={labelStyle}>Nom *
          <input style={inputStyle} value={form.nom} onChange={(e) => upd('nom', e.target.value)} placeholder="Dupont" />
        </label>
      </div>
      <label style={labelStyle}>Email *
        <input type="email" style={inputStyle} value={form.email} onChange={(e) => upd('email', e.target.value)} placeholder="jean.dupont@email.com" />
      </label>
      <label style={labelStyle}>Mot de passe temporaire * (min. 6 caractères)
        <input type="password" style={inputStyle} value={form.password} onChange={(e) => upd('password', e.target.value)} placeholder="••••••••" />
      </label>
      <label style={labelStyle}>Rôle
        <select style={inputStyle} value={form.role} onChange={(e) => upd('role', e.target.value)}>
          <option value="collaborateur">Collaborateur</option>
          <option value="admin">Admin</option>
        </select>
      </label>

      {form.role === 'collaborateur' && (
        <>
          <label style={labelStyle}>
            Profil collaborateur
            <select style={inputStyle} value={form.collaborateur_id} onChange={(e) => upd('collaborateur_id', e.target.value)}>
              <option value="">Créer automatiquement (recommandé)</option>
              {collaborateurs.filter((c) => c.actif && !c.user_id).map((c) => (
                <option key={c.id} value={c.id}>Lier à : {c.prenom} {c.nom}</option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: '#888780' }}>
              {form.collaborateur_id
                ? 'Ce compte sera lié au collaborateur existant.'
                : 'Un profil collaborateur sera créé automatiquement et l\'utilisateur pourra être assigné aux tâches.'}
            </span>
          </label>

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500, color: '#5F5E5A' }}>
              Projets accessibles
              <span style={{ color: '#888780', fontWeight: 400, marginLeft: 6 }}>({form.projets_autorises.length} sélectionné{form.projets_autorises.length > 1 ? 's' : ''})</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', padding: 2 }}>
              {projets.map((p) => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, border: `1.5px solid ${form.projets_autorises.includes(p.id) ? '#378ADD' : 'rgba(0,0,0,0.12)'}`, background: form.projets_autorises.includes(p.id) ? '#EFF6FF' : '#fff' }}>
                  <input type="checkbox" checked={form.projets_autorises.includes(p.id)} onChange={() => toggleProjet(p.id)} style={{ accentColor: '#378ADD' }} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
                  <span style={{ fontSize: 13 }}>{p.nom}</span>
                </label>
              ))}
              {projets.length === 0 && <p style={{ fontSize: 12, color: '#888780' }}>Aucun projet créé.</p>}
            </div>
          </div>
        </>
      )}

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 13, color: '#D85A30' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button onClick={onClose} style={btnSecStyle}>Annuler</button>
        <button onClick={handleCreate} disabled={loading} style={{ ...btnPrimStyle, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Création…' : 'Créer le compte'}
        </button>
      </div>
    </div>
  );
}

// ── Modal édition droits ─────────────────────────────────────────
function EditRightsModal({ user, projets, onClose }) {
  const updateUserAdmin = useAppStore((s) => s.updateUserAdmin);
  const [projetsAut, setProjetsAut] = useState(user.projets_autorises || []);
  const [loading, setLoading] = useState(false);

  const toggle = (pid) => setProjetsAut((prev) =>
    prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
  );

  const handleSave = async () => {
    setLoading(true);
    await updateUserAdmin(user.uid, { projets_autorises: projetsAut });
    setLoading(false);
    onClose();
  };

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#5F5E5A' }}>
        Projets accessibles pour <strong>{user.prenom} {user.nom}</strong>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto', padding: 2 }}>
        {projets.map((p) => (
          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 10px', borderRadius: 6, border: `1.5px solid ${projetsAut.includes(p.id) ? '#378ADD' : 'rgba(0,0,0,0.12)'}`, background: projetsAut.includes(p.id) ? '#EFF6FF' : '#fff' }}>
            <input type="checkbox" checked={projetsAut.includes(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: '#378ADD' }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
            <span style={{ fontSize: 13 }}>{p.nom}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onClose} style={btnSecStyle}>Annuler</button>
        <button onClick={handleSave} disabled={loading} style={{ ...btnPrimStyle, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  );
}

// ── Modal changement de mot de passe ────────────────────────────
function ChangePasswordModal({ user, onClose }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSave = async () => {
    if (password.length < 6) { setError('Minimum 6 caractères.'); return; }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    setError('');
    try {
      await changeUserPassword(user.uid, password);
      setDone(true);
    } catch (e) {
      setError(e.message || 'Erreur lors du changement.');
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#1D9E75' }}>Mot de passe mis à jour</p>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#888780' }}>
        {user.prenom} {user.nom} peut se connecter avec son nouveau mot de passe.
      </p>
      <button onClick={onClose} style={btnPrimStyle}>Fermer</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#5F5E5A' }}>
        Définir un nouveau mot de passe pour <strong>{user.prenom} {user.nom}</strong> ({user.email})
      </p>
      <label style={labelStyle}>
        Nouveau mot de passe (min. 6 caractères)
        <input
          type="password" autoFocus style={inputStyle}
          value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </label>
      <label style={labelStyle}>
        Confirmer le mot de passe
        <input
          type="password" style={inputStyle}
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
      </label>
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 13, color: '#D85A30' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button onClick={onClose} style={btnSecStyle}>Annuler</button>
        <button onClick={handleSave} disabled={loading} style={{ ...btnPrimStyle, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Mise à jour…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────
export default function ConsoleAdmin() {
  const usersAdmin = useAppStore((s) => s.usersAdmin);
  const projets = useAppStore((s) => s.projets);
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const activateUserAdmin = useAppStore((s) => s.activateUserAdmin);
  const deactivateUserAdmin = useAppStore((s) => s.deactivateUserAdmin);
  const addCollaborateur = useAppStore((s) => s.addCollaborateur);
  const updateCollaborateur = useAppStore((s) => s.updateCollaborateur);
  const updateUserAdmin = useAppStore((s) => s.updateUserAdmin);

  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [changingPassword, setChangingPassword] = useState(null);
  const [creating, setCreating] = useState(false);

  const admins = usersAdmin.filter((u) => u.role === 'admin');
  const collabs = usersAdmin.filter((u) => u.role === 'collaborateur');

  const getProjetNames = (ids = []) =>
    ids.map((pid) => projets.find((p) => p.id === pid)?.nom).filter(Boolean);

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title="Console Admin"
        subtitle={`${usersAdmin.length} compte${usersAdmin.length > 1 ? 's' : ''} utilisateur`}
        actions={
          <button onClick={() => setShowCreate(true)} style={btnPrimStyle}>
            <Plus size={14} style={{ marginRight: 6 }} /> Créer un utilisateur
          </button>
        }
      />

      {/* Admins */}
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Shield size={15} color="#1D4ED8" /> Administrateurs
      </h3>
      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden', marginBottom: 28 }}>
        {admins.length === 0 && (
          <p style={{ padding: '20px 16px', color: '#888780', margin: 0, fontSize: 13 }}>Aucun admin.</p>
        )}
        {admins.map((u, i) => (
          <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < admins.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={16} color="#1D4ED8" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1A1A18' }}>{u.prenom} {u.nom}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#888780' }}>{u.email}</p>
            </div>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#DBEAFE', color: '#1D4ED8', fontWeight: 600 }}>Admin</span>
            {u.derniere_connexion && (
              <span style={{ fontSize: 11, color: '#888780', flexShrink: 0 }}>
                Connecté : {new Date(u.derniere_connexion?.seconds ? u.derniere_connexion.seconds * 1000 : u.derniere_connexion).toLocaleDateString('fr-FR')}
              </span>
            )}
            <button
              title="Changer le mot de passe"
              onClick={() => setChangingPassword(u)}
              style={iconBtn}
            >
              <Lock size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Collaborateurs */}
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        <User size={15} color="#5F5E5A" /> Collaborateurs
      </h3>
      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden' }}>
        {collabs.length === 0 && (
          <p style={{ padding: '20px 16px', color: '#888780', margin: 0, fontSize: 13 }}>
            Aucun collaborateur. Cliquez sur "Créer un utilisateur" pour en ajouter.
          </p>
        )}
        {collabs.map((u, i) => {
          const projetNames = getProjetNames(u.projets_autorises);
          const collab = collaborateurs.find((c) => c.id === u.collaborateur_id);
          return (
            <div key={u.uid} style={{ padding: '14px 16px', borderBottom: i < collabs.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none', opacity: u.actif === false ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: collab?.couleur || '#E8E7E3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  {collab?.initiales || `${u.prenom?.[0] || ''}${u.nom?.[0] || ''}`}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1A1A18' }}>{u.prenom} {u.nom}</p>
                    {u.actif === false && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: '#F8F8F7', color: '#888780', border: '0.5px solid rgba(0,0,0,0.12)' }}>Inactif</span>}
                    {collab && <span style={{ fontSize: 11, color: '#888780' }}>· lié à {collab.prenom} {collab.nom}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: '#888780' }}>{u.email}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {!collab && u.actif !== false && (
                    <button
                      title="Créer un profil collaborateur pour cet utilisateur"
                      onClick={async () => {
                        const newCollab = await addCollaborateur({
                          prenom: u.prenom, nom: u.nom, couleur: randomColor(), tjm: 0, poste: '',
                        });
                        await updateCollaborateur(newCollab.id, { user_id: u.uid });
                        await updateUserAdmin(u.uid, { collaborateur_id: newCollab.id });
                      }}
                      style={{ ...iconBtn, color: '#1D9E75', fontSize: 11, padding: '5px 8px', gap: 4, whiteSpace: 'nowrap' }}
                    >
                      <User size={12} /> Créer profil
                    </button>
                  )}
                  <button
                    title="Changer le mot de passe"
                    onClick={() => setChangingPassword(u)}
                    style={iconBtn}
                  >
                    <Lock size={13} />
                  </button>
                  <button onClick={() => setEditingUser(u)} title="Gérer les accès projets" style={iconBtn}>
                    <Key size={13} />
                  </button>
                  {u.actif !== false ? (
                    <button onClick={() => { if (confirm(`Désactiver ${u.prenom} ${u.nom} ?`)) deactivateUserAdmin(u.uid); }} title="Désactiver" style={{ ...iconBtn, color: '#D85A30' }}>
                      <UserX size={13} />
                    </button>
                  ) : (
                    <button onClick={() => activateUserAdmin(u.uid)} title="Réactiver" style={{ ...iconBtn, color: '#1D9E75' }}>
                      <UserCheck size={13} />
                    </button>
                  )}
                </div>
              </div>
              {projetNames.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 48, marginTop: 6 }}>
                  {projetNames.map((nom) => {
                    const p = projets.find((pr) => pr.nom === nom);
                    return (
                      <span key={nom} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F8F8F7', color: '#5F5E5A', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {p && <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.couleur }} />}
                        {nom}
                      </span>
                    );
                  })}
                </div>
              )}
              {projetNames.length === 0 && u.actif !== false && (
                <p style={{ margin: '4px 0 0', paddingLeft: 48, fontSize: 12, color: '#D85A30' }}>
                  ⚠ Aucun projet assigné — cliquez sur 🔑 pour assigner des projets
                </p>
              )}
              {u.derniere_connexion && (
                <p style={{ margin: '4px 0 0', paddingLeft: 48, fontSize: 11, color: '#BDBCB8' }}>
                  Dernière connexion : {new Date(u.derniere_connexion?.seconds ? u.derniere_connexion.seconds * 1000 : u.derniere_connexion).toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {showCreate && (
        <Modal title="Créer un compte utilisateur" onClose={() => { if (!creating) setShowCreate(false); }} width={520} preventClose={creating}>
          <CreateUserModal projets={projets} collaborateurs={collaborateurs} onClose={() => setShowCreate(false)} onLoadingChange={setCreating} />
        </Modal>
      )}

      {editingUser && (
        <Modal title={`Accès projets — ${editingUser.prenom} ${editingUser.nom}`} onClose={() => setEditingUser(null)} width={440}>
          <EditRightsModal user={editingUser} projets={projets} onClose={() => setEditingUser(null)} />
        </Modal>
      )}

      {changingPassword && (
        <Modal title="Changer le mot de passe" onClose={() => setChangingPassword(null)} width={420}>
          <ChangePasswordModal user={changingPassword} onClose={() => setChangingPassword(null)} />
        </Modal>
      )}
    </div>
  );
}

const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#5F5E5A' };
const inputStyle = { padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', background: '#fff', boxSizing: 'border-box' };
const btnPrimStyle = { display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, border: 'none', background: '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecStyle = { padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 13, cursor: 'pointer' };
const iconBtn = { padding: '6px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', display: 'flex', color: '#5F5E5A' };
