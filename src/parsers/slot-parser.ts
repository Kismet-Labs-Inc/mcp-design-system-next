import { readFileSync } from 'fs';
import { parse as parseSfc } from '@vue/compiler-sfc';

export interface SlotDefinition {
  name: string;
  scoped: boolean;
  scopeProps?: string[];
}

interface TemplateNode {
  tag?: string;
  props?: Array<{
    type: number;
    name: string;
    value?: { content: string };
    arg?: { content: string };
    exp?: { content: string };
  }>;
  children?: TemplateNode[];
}

/**
 * Recursively walk the template AST and collect <slot> definitions.
 */
function findSlots(node: TemplateNode, seen: Set<string>, results: SlotDefinition[]): void {
  if (node.tag === 'slot') {
    const props = node.props ?? [];

    // Resolve slot name
    const staticName = props.find(p => p.type === 6 && p.name === 'name');
    const dynamicName = props.find(p => p.type === 7 && p.name === 'bind' && p.arg?.content === 'name');

    let name = 'default';
    if (staticName?.value) {
      name = staticName.value.content;
    } else if (dynamicName?.exp) {
      name = `[${dynamicName.exp.content}]`;
    }

    if (!seen.has(name)) {
      seen.add(name);

      // Collect scoped props — v-bind directives excluding :name and :class
      const scopeProps = props
        .filter(p => p.type === 7 && p.name === 'bind' && p.arg?.content && p.arg.content !== 'name' && p.arg.content !== 'class')
        .map(p => p.arg!.content);

      const slot: SlotDefinition = { name, scoped: scopeProps.length > 0 };
      if (scopeProps.length > 0) {
        slot.scopeProps = scopeProps;
      }
      results.push(slot);
    }
  }

  if (node.children) {
    for (const child of node.children) {
      findSlots(child, seen, results);
    }
  }
}

/**
 * Extract slot definitions from a Vue SFC using @vue/compiler-sfc AST.
 */
export function parseSlots(vueFilePath: string): SlotDefinition[] {
  const content = readFileSync(vueFilePath, 'utf-8');
  const { descriptor } = parseSfc(content);

  const ast = descriptor.template?.ast as TemplateNode | undefined;
  if (!ast) return [];

  const results: SlotDefinition[] = [];
  findSlots(ast, new Set<string>(), results);
  return results;
}
