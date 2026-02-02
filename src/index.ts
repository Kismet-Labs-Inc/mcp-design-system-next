#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// ── Load pre-built manifest ───────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Look for manifest in project root first (generated at build time), then dist/
const manifestPaths = [
  join(__dirname, '..', 'component-manifest.json'),
  join(__dirname, 'component-manifest.json'),
];

let manifest: Manifest;
const manifestPath = manifestPaths.find(p => existsSync(p));
if (manifestPath) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (error) {
    console.error(`Error parsing component-manifest.json: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  console.error(`Loaded manifest: ${manifest.components.length} components, design-system-next v${manifest.designSystemVersion}`);
} else {
  console.error('component-manifest.json not found. Run "npm run generate-manifest" first.');
  process.exit(1);
}

// ── Resolve design-system-next for source fallback ────────────────────

const require = createRequire(import.meta.url);
let designSystemPath: string;

try {
  const designSystemMain = require.resolve('design-system-next');
  designSystemPath = join(dirname(designSystemMain), '..');
} catch {
  console.error('Could not find design-system-next package. Make sure it is installed.');
  process.exit(1);
}

const componentsPath = join(designSystemPath, 'src', 'components');

import type { PropDefinition, EmitDefinition, SlotDefinition, TypeDefinition, ComposableInfo, SubComponentManifest, ComponentManifest, Manifest } from './types.js';

// ── Build in-memory indexes from manifest ─────────────────────────────

const componentMap = new Map<string, ComponentManifest>();
const componentsByCategory = new Map<string, ComponentManifest[]>();

for (const comp of manifest.components) {
  componentMap.set(comp.name, comp);
  const catList = componentsByCategory.get(comp.category) ?? [];
  catList.push(comp);
  componentsByCategory.set(comp.category, catList);
}

// Pre-build search index: component name → searchable text blob
const searchIndex = new Map<string, string>();
for (const comp of manifest.components) {
  const subNames = comp.subComponents.map(s => s.name).join(' ');
  const propNames = comp.props.map(p => p.name).join(' ');
  const slotNames = comp.slots.map(s => s.name).join(' ');
  const propDescriptions = comp.props.map(p => p.description ?? '').join(' ');

  searchIndex.set(
    comp.name,
    `${comp.name} ${comp.pascalName} ${comp.category} ${subNames} ${propNames} ${slotNames} ${propDescriptions}`.toLowerCase()
  );
}

// ── Source-file reader (for get_component_source fallback) ────────────

function readDirectoryRecursive(dir: string, extensions: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(dir)) return result;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const nested = readDirectoryRecursive(fullPath, extensions);
      for (const [nestedPath, content] of Object.entries(nested)) {
        result[join(entry, nestedPath)] = content;
      }
    } else if (extensions.includes(extname(entry))) {
      result[entry] = readFileSync(fullPath, 'utf-8');
    }
  }
  return result;
}

// ── Usage example generator ───────────────────────────────────────────

function generateUsageExample(
  componentName: string,
  props: PropDefinition[],
  slots: SlotDefinition[]
): string {
  const propsStr = props
    .filter(p => !p.default || p.validValues)
    .slice(0, 3)
    .map(p => {
      if (p.type === 'boolean') return p.name;
      if (p.validValues && p.validValues.length > 0) return `${p.name}="${p.validValues[0]}"`;
      if (p.type === 'string') return `${p.name}="example"`;
      return null;
    })
    .filter(Boolean)
    .join(' ');

  const propsSection = propsStr ? ` ${propsStr}` : '';

  // Build slot content hints
  const namedSlots = slots.filter(s => s.name !== 'default');
  let slotContent = '    <!-- Content -->';
  if (namedSlots.length > 0) {
    const slotLines = namedSlots.slice(0, 3).map(s => {
      if (s.scoped && s.scopeProps?.length) {
        return `    <template #${s.name}="{ ${s.scopeProps.join(', ')} }">\n      <!-- ${s.name} content -->\n    </template>`;
      }
      return `    <template #${s.name}>\n      <!-- ${s.name} content -->\n    </template>`;
    });
    slotContent = slotLines.join('\n');
  }

  return `<template>
  <Spr${componentName}${propsSection}>
${slotContent}
  </Spr${componentName}>
</template>

<script setup>
import { Spr${componentName} } from 'design-system-next';
</script>`;
}

// ── Create the MCP server ─────────────────────────────────────────────

const server = new Server(
  {
    name: 'mcp-design-system-next',
    version: '3.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Tool definitions ──────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_components',
        description: 'List all available components in the Sprout Design System. Returns compact overview with names, categories, slot counts, and sub-component counts.',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Optional category to filter by: "form", "layout", "data", "feedback", "navigation", "filter", "utility"',
            },
          },
        },
      },
      {
        name: 'get_component',
        description: 'Get structured documentation for a component: props (with types, defaults, valid values, descriptions), emits, slots (with scoped props), types, composables, and sub-components. Does NOT include raw template source — use get_component_source if you need that.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The component name (e.g., "button", "input", "modal")',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'search_components',
        description: 'Search for components by keyword across names, categories, prop names, slot names, and prop descriptions.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to match against component metadata',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_by_prop',
        description: 'Search for components that have a specific prop name or prop type. Also searches sub-component props.',
        inputSchema: {
          type: 'object',
          properties: {
            propName: {
              type: 'string',
              description: 'Prop name to search for (e.g., "disabled", "modelValue")',
            },
            propType: {
              type: 'string',
              description: 'Prop type to search for (e.g., "boolean", "string")',
            },
          },
        },
      },
      {
        name: 'get_component_source',
        description: 'Get the raw source files (.ts, .vue) for a component, including sub-components. Use this only when the structured get_component output is insufficient.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The component name (e.g., "table", "input", "modal")',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'get_tokens',
        description: 'Get design tokens (colors, spacing, border-radius, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['colors', 'spacing', 'radius', 'maxWidth', 'utilities', 'all'],
              description: 'Type of tokens to retrieve',
            },
          },
          required: ['type'],
        },
      },
      {
        name: 'list_assets',
        description: 'List available image assets and empty state illustrations in the design system',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_store',
        description: 'Get Pinia store source code from the design system. Omit name to list all stores.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Optional store name (e.g., "useSnackbarStore"). Omit to list all stores.',
            },
          },
        },
      },
    ],
  };
});

// ── Tool handlers ─────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'list_components': {
      const category = (args as { category?: string })?.category?.toLowerCase();

      let components = manifest.components;
      if (category) {
        components = componentsByCategory.get(category) ?? [];
      }

      const result = components.map(c => ({
        name: c.name,
        pascalName: c.pascalName,
        category: c.category,
        propCount: c.props.length,
        slotCount: c.slots.length,
        subComponentCount: c.subComponents.length,
        subComponents: c.subComponents.map(s => s.name),
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'get_component': {
      const componentName = (args as { name: string }).name.toLowerCase();
      const comp = componentMap.get(componentName);

      if (!comp) {
        return {
          content: [{ type: 'text', text: `Component "${componentName}" not found. Use list_components to see available components.` }],
          isError: true,
        };
      }

      const example = generateUsageExample(comp.pascalName, comp.props, comp.slots);

      // Build a slim response — no raw template, just structured data
      const result = {
        name: comp.name,
        pascalName: comp.pascalName,
        category: comp.category,
        props: comp.props,
        emits: comp.emits,
        slots: comp.slots,
        types: comp.types,
        composables: comp.composables,
        subComponents: comp.subComponents,
        usageExample: example,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'search_components': {
      const query = (args as { query: string }).query.toLowerCase();

      const matches: Array<{ name: string; pascalName: string; category: string }> = [];
      for (const [compName, blob] of searchIndex) {
        if (blob.includes(query)) {
          const comp = componentMap.get(compName)!;
          matches.push({
            name: comp.name,
            pascalName: comp.pascalName,
            category: comp.category,
          });
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }],
      };
    }

    case 'search_by_prop': {
      const { propName, propType } = args as { propName?: string; propType?: string };
      if (!propName && !propType) {
        return {
          content: [{ type: 'text', text: 'At least one of propName or propType is required.' }],
          isError: true,
        };
      }

      const filterProps = (props: PropDefinition[]): PropDefinition[] =>
        props.filter(p => {
          const nameOk = propName ? p.name.toLowerCase().includes(propName.toLowerCase()) : true;
          const typeOk = propType ? p.type.toLowerCase().includes(propType.toLowerCase()) : true;
          return nameOk && typeOk;
        });

      const matches: Array<{ component: string; pascalName: string; matchedProps: PropDefinition[] }> = [];

      for (const comp of manifest.components) {
        const matched = filterProps(comp.props);
        if (matched.length > 0) {
          matches.push({ component: comp.name, pascalName: comp.pascalName, matchedProps: matched });
        }

        for (const sub of comp.subComponents) {
          const subMatched = filterProps(sub.props);
          if (subMatched.length > 0) {
            matches.push({ component: `${comp.name}/${sub.name}`, pascalName: sub.pascalName, matchedProps: subMatched });
          }
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }],
      };
    }

    case 'get_component_source': {
      const componentName = (args as { name: string }).name.toLowerCase();
      const componentDir = join(componentsPath, componentName);

      if (!existsSync(componentDir)) {
        return {
          content: [{ type: 'text', text: `Component "${componentName}" not found. Use list_components to see available components.` }],
          isError: true,
        };
      }

      const files = readDirectoryRecursive(componentDir, ['.ts', '.vue']);
      return {
        content: [{ type: 'text', text: JSON.stringify(files, null, 2) }],
      };
    }

    case 'get_tokens': {
      const tokenType = (args as { type: string }).type;
      const tokens = manifest.tokens;

      const tokenTypeMap: Record<string, keyof typeof tokens> = {
        colors: 'colors',
        spacing: 'spacing',
        radius: 'borderRadius',
        maxWidth: 'maxWidth',
        utilities: 'utilities',
      };

      if (tokenType !== 'all' && !(tokenType in tokenTypeMap)) {
        return {
          content: [{ type: 'text', text: `Invalid token type "${tokenType}". Use one of: colors, spacing, radius, maxWidth, utilities, all` }],
          isError: true,
        };
      }

      const result = tokenType === 'all' ? tokens : tokens[tokenTypeMap[tokenType]];
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'list_assets': {
      return {
        content: [{ type: 'text', text: JSON.stringify(manifest.assets, null, 2) }],
      };
    }

    case 'get_store': {
      const storeName = (args as { name?: string })?.name;

      if (storeName) {
        const store = manifest.stores.find(
          s => s.name === storeName || s.fileName === storeName || s.fileName === `${storeName}.ts`
        );
        if (!store) {
          return {
            content: [{ type: 'text', text: `Store "${storeName}" not found. Available stores: ${manifest.stores.map(s => s.name).join(', ')}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({ name: store.name, fileName: store.fileName, source: store.source }, null, 2) }],
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(manifest.stores, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// ── Start the server ──────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Sprout Design System MCP server started (manifest-based v3.0.0)');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
