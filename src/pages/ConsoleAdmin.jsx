import { useState } from 'react';
import useAppStore from '../store/useAppStore';
import { useAuth } from '../hooks/useAuth';
import { createUserAccount, changeUserPassword } from '../config/auth';
import PageHeader from '../components/layout/PageHeader';
import Modal from '../components/ui/Modal';
import { Plus, Shield, Briefcase, UserCog, User, UserCheck, UserX, Key, Lock, Contact } from 'lucide-react';

const COLORS = ['#378ADD', 'var(--color-success)', 'var(--color-danger)', '#BA7517', '#8B5CF6', '#EC4899', '#0EA5E9', '#14B8A6'];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

// scoped = ce rôle utilise projets_autorises (accès limité à une liste explicite de projets),
// à l'inverse de admin/manager qui ont accès à tout sans passer par ce champ.
const ROLE_META = {
  admin:         { label: 'Admin',          plural: 'Admins',           icon: Shield,    bg: 'var(--color-info-soft)',    color: 'var(--color-info)',    scoped: false },
  manager:       { label: 'Manager',        plural: 'Managers',         icon: Briefcase, bg: 'var(--color-accent-soft)',  color: 'var(--color-accent)',  scoped: false },
  chef_projet:   { label: 'Chef de Projet', plural: 'Chefs de Projet',  icon: UserCog,   bg: 'var(--color-warning-soft)', color: 'var(--color-warning)', scoped: true },
  collaborateur: { label: 'Collaborateur',  plural: 'Collaborateurs',   icon: User,      bg: 'var(--color-bg-tertiary)',  color: 'var(--color-text-secondary)', scoped: true },
  // Client = profil externe en lecture seule, scopé à (généralement) 1 seul projet — mêmes
  // mécaniques que Collaborateur (projets_autorises), juste un accès plus restreint côté app
  // (cf. ProtectedRoute.jsx / ProjetLayout.jsx : Planning, Kanban, RIAD, Résumé uniquement).
  client:        { label: 'Client',         plural: 'Clients',          icon: Contact,   bg: 'var(--color-success-soft)', color: 'var(--color-success)', scoped: true },
};
const ROLE_ORDER = ['admin', 'manager', 'chef_projet', 'collaborateur', 'client'];

// ── Modal création utilisateur ───────────────────────────────────
function CreateUserModal({ projets, collaborateurs, allowedRoles, onClose, onLoadingChange }) {
  const addCollaborateur = useAppStore((s) => s.addCollaborateur);
  const updateCollaborateur = useAppStore((s) => s.updateCollaborateur);
  const [form, setForm] = useState({
    prenom: '', nom: '', email: '', password: '', role: allowedRoles.includes('collaborateur') ? 'collaborateur' : allowedRoles[0],
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

  const scoped = ROLE_META[form.role]?.scoped;

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

      if (scoped) {
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
        projets_autorises: scoped ? form.projets_autorises : [],
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
          {allowedRoles.map((r) => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
        </select>
      </label>

      {scoped && (
        <>
          {/* Pas de profil collaborateur pour un Client : c'est un profil externe, jamais assigné
              à des tâches — inutile de créer/lier une fiche collaborateur pour lui. */}
          {form.role !== 'client' && (
            <label style={labelStyle}>
              Profil collaborateur
              <select style={inputStyle} value={form.collaborateur_id} onChange={(e) => upd('collaborateur_id', e.target.value)}>
                <option value="">Créer automatiquement (recommandé)</option>
                {collaborateurs.filter((c) => c.actif && !c.user_id).map((c) => (
                  <option key={c.id} value={c.id}>Lier à : {c.prenom} {c.nom}</option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {form.collaborateur_id
                  ? 'Ce compte sera lié au collaborateur existant.'
                  : 'Un profil collaborateur sera créé automatiquement et l\'utilisateur pourra être assigné aux tâches.'}
              </span>
            </label>
          )}

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
              Projets accessibles
              <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400, marginLeft: 6 }}>({form.projets_autorises.length} sélectionné{form.projets_autorises.length > 1 ? 's' : ''})</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', padding: 2 }}>
              {projets.map((p) => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, border: `1.5px solid ${form.projets_autorises.includes(p.id) ? 'var(--color-accent)' : 'var(--color-border)'}`, background: form.projets_autorises.includes(p.id) ? 'var(--color-accent-soft)' : 'var(--color-bg-card)' }}>
                  <input type="checkbox" checked={form.projets_autorises.includes(p.id)} onChange={() => toggleProjet(p.id)} style={{ accentColor: 'var(--color-accent)' }} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
                  <span style={{ fontSize: 13 }}>{p.nom}</span>
                </label>
              ))}
              {projets.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Aucun projet créé.</p>}
            </div>
          </div>
        </>
      )}

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger)', fontSize: 13, color: 'var(--color-danger)' }}>
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
// Un même profil peut être Collaborateur sur un projet et Chef de Projet sur un autre : en plus
// de la case à cocher "accès à ce projet" (projets_autorises), chaque projet coché a maintenant
// son propre sélecteur de rôle (projets_roles = { [projetId]: 'chef_projet'|'collaborateur' }).
// Sans entrée dans projets_roles pour un projet, le rôle global de la personne s'applique (cf.
// roleSurProjet dans useAuth.jsx et getRoleSurProjet dans firestore.rules) — donc initialiser le
// sélecteur sur le rôle global tant que l'admin n'a rien changé ne modifie aucun droit existant.
function EditRightsModal({ user, projets, onClose }) {
  const updateUserAdmin = useAppStore((s) => s.updateUserAdmin);
  const [projetsAut, setProjetsAut] = useState(user.projets_autorises || []);
  const [projetsRoles, setProjetsRoles] = useState(user.projets_roles || {});
  const [loading, setLoading] = useState(false);

  const toggle = (pid) => setProjetsAut((prev) =>
    prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
  );
  const roleFor = (pid) => projetsRoles[pid] || user.role;
  const setRoleFor = (pid, role) => setProjetsRoles((prev) => ({ ...prev, [pid]: role }));

  const handleSave = async () => {
    setLoading(true);
    // On ne garde que les surcharges de rôle pour des projets encore cochés — inutile de
    // conserver une entrée pour un projet dont l'accès vient d'être retiré.
    const rolesPropres = Object.fromEntries(
      Object.entries(projetsRoles).filter(([pid]) => projetsAut.includes(pid))
    );
    await updateUserAdmin(user.uid, { projets_autorises: projetsAut, projets_roles: rolesPropres });
    setLoading(false);
    onClose();
  };

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Projets accessibles pour <strong>{user.prenom} {user.nom}</strong>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto', padding: 2 }}>
        {projets.map((p) => {
          const checked = projetsAut.includes(p.id);
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, border: `1.5px solid ${checked ? 'var(--color-accent)' : 'var(--color-border)'}`, background: checked ? 'var(--color-accent-soft)' : 'var(--color-bg-card)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} style={{ accentColor: 'var(--color-accent)' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
                <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
              </label>
              {/* Pas de surcharge de rôle par projet pour un Client : c'est un rôle global (pas
                  d'équivalent "chef de projet"/"collaborateur" pour un profil externe en lecture
                  seule) — cf. ConsoleAdmin.jsx ROLE_META et useAuth.jsx isClient. */}
              {checked && user.role !== 'client' && (
                <select
                  value={roleFor(p.id)}
                  onChange={(e) => setRoleFor(p.id, e.target.value)}
                  style={{ fontSize: 11, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', flexShrink: 0 }}
                  title="Rôle sur ce projet précis"
                >
                  <option value="collaborateur">Collaborateur</option>
                  <option value="chef_projet">Chef de Projet</option>
                </select>
              )}
            </div>
          );
        })}
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
      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--color-success)' }}>Mot de passe mis à jour</p>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        {user.prenom} {user.nom} peut se connecter avec son nouveau mot de passe.
      </p>
      <button onClick={onClose} style={btnPrimStyle}>Fermer</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
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
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger)', fontSize: 13, color: 'var(--color-danger)' }}>
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

// ── Une ligne compte utilisateur ──────────────────────────────────
function UserRow({ u, isLast, roleKey, projets, collaborateurs, getProjetNames, locked,
  onChangePassword, onEditRights, onDeactivate, onActivate, onCreateCollabProfile }) {
  const meta = ROLE_META[roleKey];
  const collab = meta.scoped ? collaborateurs.find((c) => c.id === u.collaborateur_id) : null;
  const projetNames = meta.scoped ? getProjetNames(u.projets_autorises) : [];
  const Icon = meta.icon;

  return (
    <div style={{ padding: '14px 16px', borderBottom: isLast ? 'none' : '0.5px solid var(--color-border-soft)', opacity: u.actif === false ? 0.5 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {collab ? (
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: collab.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>
            {collab.initiales}
          </div>
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={16} color={meta.color} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{u.prenom} {u.nom}</p>
            {u.actif === false && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)', border: '0.5px solid var(--color-border)' }}>Inactif</span>}
            {collab && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>· lié à {collab.prenom} {collab.nom}</span>}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>{u.email}</p>
        </div>
        {!meta.scoped && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: meta.bg, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
        )}
        {u.derniere_connexion && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
            Connecté : {new Date(u.derniere_connexion?.seconds ? u.derniere_connexion.seconds * 1000 : u.derniere_connexion).toLocaleDateString('fr-FR')}
          </span>
        )}
        {!locked && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {meta.scoped && !collab && u.actif !== false && (
              <button
                title="Créer un profil collaborateur pour cet utilisateur"
                onClick={() => onCreateCollabProfile(u)}
                style={{ ...iconBtn, color: 'var(--color-success)', fontSize: 11, padding: '5px 8px', gap: 4, whiteSpace: 'nowrap' }}
              >
                <User size={12} /> Créer profil
              </button>
            )}
            <button title="Changer le mot de passe" onClick={() => onChangePassword(u)} style={iconBtn}>
              <Lock size={13} />
            </button>
            {meta.scoped && (
              <button onClick={() => onEditRights(u)} title="Gérer les accès projets" style={iconBtn}>
                <Key size={13} />
              </button>
            )}
            {roleKey !== 'admin' && (
              u.actif !== false ? (
                <button onClick={() => onDeactivate(u)} title="Désactiver" style={{ ...iconBtn, color: 'var(--color-danger)' }}>
                  <UserX size={13} />
                </button>
              ) : (
                <button onClick={() => onActivate(u)} title="Réactiver" style={{ ...iconBtn, color: 'var(--color-success)' }}>
                  <UserCheck size={13} />
                </button>
              )
            )}
          </div>
        )}
      </div>
      {meta.scoped && projetNames.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 48, marginTop: 6 }}>
          {projetNames.map((nom) => {
            const p = projets.find((pr) => pr.nom === nom);
            return (
              <span key={nom} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, border: '0.5px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {p && <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.couleur }} />}
                {nom}
              </span>
            );
          })}
        </div>
      )}
      {meta.scoped && projetNames.length === 0 && u.actif !== false && !locked && (
        <p style={{ margin: '4px 0 0', paddingLeft: 48, fontSize: 12, color: 'var(--color-danger)' }}>
          ⚠ Aucun projet assigné — cliquez sur 🔑 pour assigner des projets
        </p>
      )}
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
  const { isManager } = useAuth();

  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [changingPassword, setChangingPassword] = useState(null);
  const [creating, setCreating] = useState(false);

  // Un Manager ne peut ni créer un Admin, ni agir sur un compte Admin existant
  // (garde-fou UI — la règle Firestore l'impose de toute façon côté serveur).
  const allowedRoles = isManager ? ROLE_ORDER.filter((r) => r !== 'admin') : ROLE_ORDER;

  const getProjetNames = (ids = []) =>
    ids.map((pid) => projets.find((p) => p.id === pid)?.nom).filter(Boolean);

  const handleCreateCollabProfile = async (u) => {
    const newCollab = await addCollaborateur({
      prenom: u.prenom, nom: u.nom, couleur: randomColor(), tjm: 0, poste: '',
    });
    await updateCollaborateur(newCollab.id, { user_id: u.uid });
    await updateUserAdmin(u.uid, { collaborateur_id: newCollab.id });
  };

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

      {ROLE_ORDER.map((roleKey) => {
        const meta = ROLE_META[roleKey];
        const list = usersAdmin.filter((u) => u.role === roleKey);
        const locked = isManager && roleKey === 'admin'; // Manager : lecture seule sur les comptes Admin
        const Icon = meta.icon;
        return (
          <div key={roleKey} style={{ marginBottom: 28 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon size={15} color={meta.color} /> {meta.plural}
            </h3>
            <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
              {list.length === 0 && (
                <p style={{ padding: '20px 16px', color: 'var(--color-text-tertiary)', margin: 0, fontSize: 13 }}>
                  Aucun compte {meta.label.toLowerCase()}.
                </p>
              )}
              {list.map((u, i) => (
                <UserRow
                  key={u.uid}
                  u={u}
                  isLast={i === list.length - 1}
                  roleKey={roleKey}
                  projets={projets}
                  collaborateurs={collaborateurs}
                  getProjetNames={getProjetNames}
                  locked={locked}
                  onChangePassword={setChangingPassword}
                  onEditRights={setEditingUser}
                  onDeactivate={(user) => { if (confirm(`Désactiver ${user.prenom} ${user.nom} ?`)) deactivateUserAdmin(user.uid); }}
                  onActivate={(user) => activateUserAdmin(user.uid)}
                  onCreateCollabProfile={handleCreateCollabProfile}
                />
              ))}
            </div>
          </div>
        );
      })}

      {showCreate && (
        <Modal title="Créer un compte utilisateur" onClose={() => { if (!creating) setShowCreate(false); }} width={520} preventClose={creating}>
          <CreateUserModal projets={projets} collaborateurs={collaborateurs} allowedRoles={allowedRoles} onClose={() => setShowCreate(false)} onLoadingChange={setCreating} />
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

const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' };
const inputStyle = { padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', boxSizing: 'border-box' };
const btnPrimStyle = { display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecStyle = { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', fontSize: 13, cursor: 'pointer' };
const iconBtn = { padding: '6px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', cursor: 'pointer', display: 'flex', color: 'var(--color-text-secondary)' };
