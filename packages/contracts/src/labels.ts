import type { LabelDefinition } from './entities.js';

export const LABEL_COLOR_IDS = ['violet', 'blue', 'teal', 'amber', 'rose', 'red', 'green', 'orange', 'gray'] as const;

const LEGACY_BUILT_IN_LABEL_IDS = new Set(['design', 'frontend', 'backend', 'research', 'content', 'bug', 'qa', 'growth']);

function labelColor(value: unknown): string {
  return typeof value === 'string' && LABEL_COLOR_IDS.includes(value as (typeof LABEL_COLOR_IDS)[number]) ? value : 'gray';
}

/**
 * Labels are workspace configuration rather than task-specific values.
 * Workspaces start empty, and the legacy built-in labels are discarded so
 * existing local data does not bring them back after upgrading.
 */
export function normalizeLabelDefinitions(value: unknown): LabelDefinition[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const labels: LabelDefinition[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    if (!id || !name || seen.has(id) || LEGACY_BUILT_IN_LABEL_IDS.has(id)) continue;
    seen.add(id);
    labels.push({
      id,
      name,
      color: labelColor(candidate.color),
    });
  }
  return labels;
}
