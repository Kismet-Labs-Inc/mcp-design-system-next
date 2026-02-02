import { readFileSync } from 'fs';

export interface SlotDefinition {
  name: string;
  scoped: boolean;
  scopeProps?: string[];
}

/**
 * Extract the root <template> block from a Vue SFC, handling nested <template> tags.
 */
function extractRootTemplate(content: string): string {
  const openMatch = content.match(/<template\b[^>]*>/);
  if (!openMatch || typeof openMatch.index === 'undefined') return '';
  const openIdx = openMatch.index;

  let depth = 1;
  let pos = openIdx + openMatch[0].length;
  const openTag = /<template[\s>]/g;
  const closeTag = /<\/template\s*>/g;

  while (depth > 0 && pos < content.length) {
    openTag.lastIndex = pos;
    closeTag.lastIndex = pos;

    const nextOpen = openTag.exec(content);
    const nextClose = closeTag.exec(content);

    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        return content.substring(openIdx + openMatch[0].length, nextClose.index);
      }
      pos = nextClose.index + nextClose[0].length;
    }
  }

  return '';
}

/**
 * Extract slot definitions from a Vue SFC template block.
 * Parses <slot> tags to find named slots and their scoped props.
 */
export function parseSlots(vueFilePath: string): SlotDefinition[] {
  const content = readFileSync(vueFilePath, 'utf-8');

  const template = extractRootTemplate(content);
  if (!template) return [];

  const slots: SlotDefinition[] = [];
  const seenNames = new Set<string>();

  // Find every <slot ... /> or <slot ...>...</slot> tag by locating <slot
  // and then reading forward to find the closing > or />
  let searchPos = 0;
  while (searchPos < template.length) {
    const idx = template.indexOf('<slot', searchPos);
    if (idx === -1) break;

    // Ensure it's actually <slot followed by whitespace, > or /
    const afterSlot = template[idx + 5];
    if (afterSlot && afterSlot !== ' ' && afterSlot !== '\n' && afterSlot !== '\t' && afterSlot !== '/' && afterSlot !== '>') {
      searchPos = idx + 5;
      continue;
    }

    // Find the end of the opening tag (first unquoted >)
    let tagEnd = idx + 5;
    let inQuote: string | null = null;
    while (tagEnd < template.length) {
      const ch = template[tagEnd];
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
      } else if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === '>') {
        break;
      }
      tagEnd++;
    }

    const tagContent = template.substring(idx + 5, tagEnd);
    searchPos = tagEnd + 1;

    // Extract slot name
    const nameMatch = tagContent.match(/(?:^|\s)name=["']([^"']+)["']/);
    const dynamicNameMatch = tagContent.match(/(?:^|\s):name=["']([^"']+)["']/);

    let name: string;
    if (nameMatch) {
      name = nameMatch[1];
    } else if (dynamicNameMatch) {
      name = `[${dynamicNameMatch[1]}]`;
    } else {
      name = 'default';
    }

    if (seenNames.has(name)) continue;
    seenNames.add(name);

    // Extract scoped props — :propName or v-bind:propName bindings (excluding :name and :class)
    const scopeProps: string[] = [];
    const bindRegex = /(?:^|\s)(?::|v-bind:)(\w+)/g;
    let bindMatch;
    while ((bindMatch = bindRegex.exec(tagContent)) !== null) {
      const propName = bindMatch[1];
      if (propName !== 'name' && propName !== 'class') {
        scopeProps.push(propName);
      }
    }

    const scoped = scopeProps.length > 0;
    const slot: SlotDefinition = { name, scoped };
    if (scoped) {
      slot.scopeProps = scopeProps;
    }

    slots.push(slot);
  }

  return slots;
}
