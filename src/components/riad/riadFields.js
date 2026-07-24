import { PROBABILITE_LEVELS, IMPACT_LEVELS, STATUS_LEVELS } from '../../utils/riadCalculs';

export { PROBABILITE_LEVELS, IMPACT_LEVELS, STATUS_LEVELS };

export const RIAD_TITLES = { risques: 'Risques', issues: 'Incidents', actions: 'Actions', decisions: 'Décisions' };
export const RIAD_PREFIX = { risques: 'R', issues: 'I', actions: 'A', decisions: 'D' };

export const RIAD_FIELDS = {
  risques: [
    { key: 'categorie', label: 'Catégorie', type: 'text' },
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea', required: true },
    { key: 'escalade', label: 'Escalade', type: 'escalade' },
    { key: 'impact', label: 'Impact', type: 'select', options: IMPACT_LEVELS },
    { key: 'probabilite', label: 'Probabilité', type: 'select', options: PROBABILITE_LEVELS },
    { key: 'responsable', label: 'Responsable', type: 'text' },
    { key: 'plan_action', label: "Plan d'action", type: 'textarea', list: false },
    { key: 'deadline', label: 'Deadline', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: STATUS_LEVELS },
    { key: 'commentaire', label: 'Commentaire', type: 'textarea', list: false },
  ],
  issues: [
    { key: 'categorie', label: 'Catégorie', type: 'text' },
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea', required: true },
    { key: 'escalade', label: 'Escalade', type: 'escalade' },
    { key: 'impact', label: 'Impact', type: 'select', options: IMPACT_LEVELS },
    { key: 'responsable', label: 'Responsable', type: 'text' },
    { key: 'plan_action', label: "Plan d'action", type: 'textarea', list: false },
    { key: 'deadline', label: 'Deadline', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: STATUS_LEVELS },
    { key: 'commentaire', label: 'Commentaire', type: 'textarea', list: false },
  ],
  actions: [
    { key: 'source', label: 'Source', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea', required: true },
    { key: 'escalade', label: 'Escalade', type: 'escalade' },
    { key: 'responsable', label: 'Responsable', type: 'text' },
    { key: 'deadline', label: 'Deadline', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: STATUS_LEVELS },
    { key: 'commentaire', label: 'Commentaire', type: 'textarea', list: false },
  ],
  decisions: [
    { key: 'categorie', label: 'Catégorie', type: 'text' },
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea', required: true },
    { key: 'escalade', label: 'Escalade', type: 'escalade' },
    { key: 'responsable', label: 'Responsable', type: 'text' },
    { key: 'deadline', label: 'Deadline', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: STATUS_LEVELS },
    { key: 'commentaire', label: 'Commentaire', type: 'textarea', list: false },
  ],
};
