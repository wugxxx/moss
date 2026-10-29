import type { Project } from '@moss/contracts';

export function projectKey(name: string, existing: Project[]): string {
  let key = name
    .split(/\s+/)
    .map(word => word[0] ?? '')
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  if (key.length < 2) {
    key = name
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase();
  }
  if (!key) key = 'PRJ';
  while (existing.some(project => project.key === key)) key += 'X';
  return key;
}
