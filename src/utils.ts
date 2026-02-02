/**
 * Shared utility functions for the MCP server and manifest generator.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

export function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export interface SubComponentMeta {
  name: string;
  pascalName: string;
  hasProps: boolean;
}

export function getSubComponents(componentDir: string, componentName: string): SubComponentMeta[] {
  const subs: SubComponentMeta[] = [];
  if (!existsSync(componentDir)) return subs;

  const entries = readdirSync(componentDir);
  for (const entry of entries) {
    const fullPath = join(componentDir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      const subTsFile = join(fullPath, `${entry}.ts`);
      const subVueFile = join(fullPath, `${entry}.vue`);
      const hasTs = existsSync(subTsFile);
      const hasVue = existsSync(subVueFile);

      const innerEntries = readdirSync(fullPath);
      const innerVues = innerEntries.filter(e => extname(e) === '.vue');

      if (hasTs || hasVue) {
        subs.push({ name: entry, pascalName: toPascalCase(entry), hasProps: hasTs });
      } else if (innerVues.length > 0) {
        for (const vue of innerVues) {
          const vueName = vue.replace('.vue', '');
          subs.push({ name: vueName, pascalName: vueName, hasProps: false });
        }
      }
    } else if (extname(entry) === '.vue') {
      const fileName = entry.replace('.vue', '');
      if (fileName !== componentName) {
        subs.push({
          name: fileName,
          pascalName: toPascalCase(fileName),
          hasProps: existsSync(join(componentDir, `${fileName}.ts`)),
        });
      }
    }
  }

  return subs;
}

export const componentCategories: Record<string, string[]> = {
  form: ['button', 'checkbox', 'input', 'radio', 'select', 'slider', 'switch', 'textarea', 'file-upload', 'date-picker', 'time-picker'],
  layout: ['accordion', 'card', 'collapsible', 'sidenav', 'sidepanel', 'tabs', 'modal'],
  data: ['avatar', 'badge', 'banner', 'calendar', 'calendar-cell', 'chips', 'empty-state', 'list', 'lozenge', 'progress-bar', 'status', 'table', 'audit-trail'],
  feedback: ['snackbar', 'tooltip', 'popper'],
  navigation: ['dropdown', 'stepper', 'floating-action'],
  filter: ['attribute-filter', 'filter'],
  utility: ['icon', 'logo'],
};

export function getComponentCategory(name: string): string {
  for (const [category, components] of Object.entries(componentCategories)) {
    if (components.includes(name)) return category;
  }
  return 'other';
}

/**
 * Resolve a file path by checking nested directory first, then flat.
 * Returns null if neither exists.
 */
export function resolveSubComponentPath(
  componentDir: string,
  subName: string,
  ext: string,
): string | null {
  const nestedPath = join(componentDir, subName, `${subName}.${ext}`);
  if (existsSync(nestedPath)) return nestedPath;
  const flatPath = join(componentDir, `${subName}.${ext}`);
  if (existsSync(flatPath)) return flatPath;
  return null;
}
