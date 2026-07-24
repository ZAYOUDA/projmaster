import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import useAppStore from '../../store/useAppStore';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import { RIAD_FIELDS, RIAD_PREFIX, STATUS_LEVELS } from './riadFields';

const STATUS_VARIANT = { ouvert: 'danger', en_cours: 'warning', cloture: 'success' };
const STATUS_LABEL = Object.fromEntries(STATUS_LEVELS.map((s) => [s.key, s.label]));

const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#5F5E5A' };
const inputStyle = { padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%' };
const btnPrimStyle = { display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, border: 'none', background: '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecStyle = { padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const iconBtnStyle = { padding: 5, borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', display: 'flex', color: '#5F5E5A' };
const thStyle = { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#888780', whiteSpace: 'nowrap' };
const tdStyle = { padding: '10px 12px', fontSize: 12.5, color: '#1A1A18', maxWidth: 220 };

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—';
}

function ItemForm({ module, escaladeNiveaux, initial, onSave, onCancel }) {
  const fields = RIAD_FIELDS[module];
  const defaults = Object.fromEntries(fields.map((f) => [f.key, f.type === 'select' ? f.options[0].key : '']));
  const [form, setForm] = useState({ ...defaults, escalade: escaladeNiveaux[0] || '', status: 'ouvert', ...initial });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {fields.map((f) => (
          <label key={f.key} style={labelStyle}>
            {f.label}{f.required ? ' *' : ''}
            {f.type === 'textarea' && (
              <textarea
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                value={form[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} required={f.required}
              />
            )}
            {f.type === 'date' && (
              <input type="date" style={inputStyle} value={form[f.key] || ''} onChange={(e) => set(f.key, e.target.value || null)} />
            )}
            {f.type === 'select' && (
              <select style={inputStyle} value={form[f.key] || ''} onChange={(e) => set(f.key, e.target.value)}>
                {f.options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            )}
            {f.type === 'escalade' && (
              <select style={inputStyle} value={form[f.key] || ''} onChange={(e) => set(f.key, e.target.value)}>
                {escaladeNiveaux.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            {f.type === 'text' && (
              <input style={inputStyle} value={form[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} required={f.required} />
            )}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="button" onClick={onCancel} style={btnSecStyle}>Annuler</button>
        <button type="submit" style={btnPrimStyle}>Enregistrer</button>
      </div>
    </form>
  );
}

export default function RiadModuleTable({ projet, module }) {
  const addRiadItem = useAppStore((s) => s.addRiadItem);
  const updateRiadItem = useAppStore((s) => s.updateRiadItem);
  const deleteRiadItem = useAppStore((s) => s.deleteRiadItem);
  const [modal, setModal] = useState(null); // null | 'new' | item
  const [filter, setFilter] = useState('tous');

  const fields = RIAD_FIELDS[module];
  const escaladeNiveaux = projet.escalade_niveaux || [];
  const allItems = projet.riad?.[module] || [];
  const items = (filter === 'tous' ? allItems : allItems.filter((it) => it.status === filter))
    .slice()
    .sort((a, b) => (a.numero || 0) - (b.numero || 0));
  const listFields = fields.filter((f) => f.list !== false);

  const cellValue = (item, f) => {
    const v = item[f.key];
    if (f.type === 'date') return fmtDate(v);
    if (f.type === 'select') return f.options.find((o) => o.key === v)?.label || '—';
    if (f.key === 'description' && v && v.length > 60) return `${v.slice(0, 60)}…`;
    return v || '—';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['tous', ...STATUS_LEVELS.map((s) => s.key)].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                border: '1px solid rgba(0,0,0,0.15)',
                background: filter === s ? '#1A1A18' : '#fff',
                color: filter === s ? '#fff' : '#5F5E5A',
              }}
            >
              {s === 'tous' ? 'Tous' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <button onClick={() => setModal('new')} style={btnPrimStyle}>
          <Plus size={14} style={{ marginRight: 4 }} /> Ajouter
        </button>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8F8F7', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
              <th style={thStyle}>#</th>
              {listFields.map((f) => <th key={f.key} style={thStyle}>{f.label}</th>)}
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#888780' }}>
                  {RIAD_PREFIX[module]}{String(it.numero ?? 0).padStart(3, '0')}
                </td>
                {listFields.map((f) => (
                  <td key={f.key} style={tdStyle}>
                    {f.key === 'status'
                      ? <Badge label={cellValue(it, f)} variant={STATUS_VARIANT[it.status]} />
                      : cellValue(it, f)}
                  </td>
                ))}
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setModal(it)} style={iconBtnStyle} title="Modifier"><Pencil size={13} /></button>
                    <button
                      onClick={() => { if (confirm('Supprimer cette entrée ?')) deleteRiadItem(projet.id, module, it.id); }}
                      style={{ ...iconBtnStyle, color: '#D85A30' }}
                      title="Supprimer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={listFields.length + 2} style={{ padding: 40, textAlign: 'center', color: '#888780' }}>Aucune entrée.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Ajouter' : 'Modifier'} onClose={() => setModal(null)} width={560}>
          <ItemForm
            module={module}
            escaladeNiveaux={escaladeNiveaux}
            initial={modal === 'new' ? null : modal}
            onSave={(data) => {
              if (modal === 'new') addRiadItem(projet.id, module, data);
              else updateRiadItem(projet.id, module, modal.id, data);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
