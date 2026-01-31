#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, relative, extname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { parseComponentProps, getComponentNameFromPath, type PropDefinition } from './parsers/props-parser.js';
import { parseVueFile, generateUsageExample } from './parsers/vue-parser.js';
import { getAllTokens, parseColors, parseSpacing, parseBorderRadius, parseMaxWidth, parseUtilities } from './parsers/token-parser.js';
import { parseComposable, type ComposableInfo } from './parsers/composable-parser.js';
import { parseTypes, type TypeDefinition } from './parsers/type-parser.js';

// Resolve the design-system-next package path
const require = createRequire(import.meta.url);
let designSystemPath: string;

try {
  // Resolve the main entry point and find the package root
  const designSystemMain = require.resolve('design-system-next');
  // The main entry is at dist/design-system-next.es.js, so go up 2 levels
  designSystemPath = join(dirname(designSystemMain), '..');
} catch {
  console.error('Could not find design-system-next package. Make sure it is installed.');
  process.exit(1);
}

const componentsPath = join(designSystemPath, 'src', 'components');
const assetsPath = join(designSystemPath, 'src', 'assets');
const storesPath = join(designSystemPath, 'src', 'stores');

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

interface SubComponent {
  name: string;
  pascalName: string;
  hasProps: boolean;
}

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function getSubComponents(componentDir: string, componentName: string): SubComponent[] {
  const subs: SubComponent[] = [];
  if (!existsSync(componentDir)) return subs;

  const entries = readdirSync(componentDir);
  for (const entry of entries) {
    const fullPath = join(componentDir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Nested sub-component directory (e.g., table-actions/)
      const subTsFile = join(fullPath, `${entry}.ts`);
      const subVueFile = join(fullPath, `${entry}.vue`);
      const hasTs = existsSync(subTsFile);
      const hasVue = existsSync(subVueFile);

      // Also check for PascalCase .vue files inside (e.g., tabs/DatePickerCalendarTab.vue)
      const innerEntries = readdirSync(fullPath);
      const innerVues = innerEntries.filter(e => extname(e) === '.vue');

      if (hasTs || hasVue) {
        subs.push({ name: entry, pascalName: toPascalCase(entry), hasProps: hasTs });
      } else if (innerVues.length > 0) {
        // Directory with PascalCase .vue files (no matching kebab-case file)
        for (const vue of innerVues) {
          const vueName = vue.replace('.vue', '');
          subs.push({ name: vueName, pascalName: vueName, hasProps: false });
        }
      }
    } else if (extname(entry) === '.vue') {
      // Flat sub-component: .vue file whose name differs from the main component
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

// Create the MCP server
const server = new Server(
  {
    name: 'mcp-design-system-next',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_components',
        description: 'List all available components in the Sprout Design System',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Optional category to filter by (e.g., "form", "layout", "feedback")',
            },
          },
        },
      },
      {
        name: 'get_component',
        description: 'Get detailed information about a specific component including props, emits, and usage example',
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
        description: 'Search for components by keyword',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to match against component names',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_by_prop',
        description: 'Search for components that have a specific prop name or prop type',
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
        description: 'Get the raw source files (.ts, .vue) for a component, including sub-components. Returns file paths as keys and contents as values for AI to read directly.',
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

// Component categories for classification
const componentCategories: Record<string, string[]> = {
  form: ['button', 'checkbox', 'input', 'radio', 'select', 'slider', 'switch', 'textarea', 'file-upload', 'date-picker', 'time-picker'],
  layout: ['accordion', 'card', 'collapsible', 'sidenav', 'sidepanel', 'tabs', 'modal'],
  data: ['avatar', 'badge', 'banner', 'calendar', 'calendar-cell', 'chips', 'empty-state', 'list', 'lozenge', 'progress-bar', 'status', 'table', 'audit-trail'],
  feedback: ['snackbar', 'tooltip', 'popper'],
  navigation: ['dropdown', 'stepper', 'floating-action'],
  filter: ['attribute-filter', 'filter'],
  utility: ['icon', 'logo'],
};

function getComponentCategory(name: string): string {
  for (const [category, components] of Object.entries(componentCategories)) {
    if (components.includes(name)) {
      return category;
    }
  }
  return 'other';
}

function getAllComponents(): string[] {
  if (!existsSync(componentsPath)) {
    return [];
  }

  return readdirSync(componentsPath).filter(name => {
    const fullPath = join(componentsPath, name);
    return statSync(fullPath).isDirectory();
  });
}

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'list_components': {
      const category = (args as { category?: string })?.category?.toLowerCase();
      let components = getAllComponents();

      if (category) {
        components = components.filter(c => getComponentCategory(c) === category);
      }

      const result = components.map(c => {
        const subs = getSubComponents(join(componentsPath, c), c);
        return {
          name: c,
          pascalName: getComponentNameFromPath(join(componentsPath, c)),
          category: getComponentCategory(c),
          subComponentCount: subs.length,
          subComponents: subs.map(s => s.name),
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'get_component': {
      const componentName = (args as { name: string }).name.toLowerCase();
      const componentDir = join(componentsPath, componentName);

      if (!existsSync(componentDir)) {
        return {
          content: [
            {
              type: 'text',
              text: `Component "${componentName}" not found. Use list_components to see available components.`,
            },
          ],
          isError: true,
        };
      }

      const tsFile = join(componentDir, `${componentName}.ts`);
      const vueFile = join(componentDir, `${componentName}.vue`);

      let props: PropDefinition[] = [];
      let emits: { name: string; payloadType?: string }[] = [];

      let types: TypeDefinition[] = [];
      if (existsSync(tsFile)) {
        const parsed = parseComponentProps(tsFile);
        props = parsed.props;
        emits = parsed.emits;
        types = parseTypes(tsFile);
      }

      let template = '';
      if (existsSync(vueFile)) {
        const vue = parseVueFile(vueFile);
        template = vue.template;
      }

      const pascalName = getComponentNameFromPath(componentDir);
      const example = generateUsageExample(pascalName, props);

      // Sub-components
      const subs = getSubComponents(componentDir, componentName);
      const subComponentDetails = subs.map(sub => {
        let subProps: PropDefinition[] = [];
        let subEmits: { name: string; payloadType?: string }[] = [];
        if (sub.hasProps) {
          // Try nested dir first, then flat file
          const subTsPath = existsSync(join(componentDir, sub.name, `${sub.name}.ts`))
            ? join(componentDir, sub.name, `${sub.name}.ts`)
            : join(componentDir, `${sub.name}.ts`);
          if (existsSync(subTsPath)) {
            const parsed = parseComponentProps(subTsPath);
            subProps = parsed.props;
            subEmits = parsed.emits;
          }
        }
        return {
          name: sub.name,
          pascalName: sub.pascalName,
          props: subProps,
          emits: subEmits,
        };
      });

      // Composables
      const composables: ComposableInfo[] = [];
      if (existsSync(componentDir)) {
        const dirEntries = readdirSync(componentDir);
        for (const entry of dirEntries) {
          if (entry.startsWith('use-') && entry.endsWith('.ts')) {
            composables.push(parseComposable(join(componentDir, entry)));
          }
        }
      }

      const result = {
        name: componentName,
        pascalName,
        category: getComponentCategory(componentName),
        props,
        emits,
        template,
        usageExample: example,
        types,
        subComponents: subComponentDetails,
        composables,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'search_components': {
      const query = (args as { query: string }).query.toLowerCase();
      const components = getAllComponents();

      const matches = components.filter(c => {
        const pascalName = getComponentNameFromPath(join(componentsPath, c));
        const category = getComponentCategory(c);
        const subs = getSubComponents(join(componentsPath, c), c);
        const subNames = subs.map(s => s.name).join(' ');

        // Build search blob: name, pascalName, category, sub-component names, prop names
        let searchBlob = `${c} ${pascalName} ${category} ${subNames}`.toLowerCase();

        // Add prop names if .ts file exists
        const tsFile = join(componentsPath, c, `${c}.ts`);
        if (existsSync(tsFile)) {
          try {
            const parsed = parseComponentProps(tsFile);
            const propNames = parsed.props.map(p => p.name).join(' ');
            searchBlob += ` ${propNames}`;
          } catch {
            // Skip if parsing fails
          }
        }

        return searchBlob.includes(query);
      });

      const result = matches.map(c => ({
        name: c,
        pascalName: getComponentNameFromPath(join(componentsPath, c)),
        category: getComponentCategory(c),
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
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

      const components = getAllComponents();
      const matches: Array<{ component: string; pascalName: string; matchedProps: PropDefinition[] }> = [];

      for (const c of components) {
        const tsFile = join(componentsPath, c, `${c}.ts`);
        if (!existsSync(tsFile)) continue;

        try {
          const parsed = parseComponentProps(tsFile);
          const matched = parsed.props.filter(p => {
            const nameMatch = propName ? p.name.toLowerCase().includes(propName.toLowerCase()) : true;
            const typeMatch = propType ? p.type.toLowerCase().includes(propType.toLowerCase()) : true;
            return nameMatch && typeMatch;
          });

          if (matched.length > 0) {
            matches.push({
              component: c,
              pascalName: getComponentNameFromPath(join(componentsPath, c)),
              matchedProps: matched,
            });
          }

          // Also check sub-components
          const subs = getSubComponents(join(componentsPath, c), c);
          for (const sub of subs) {
            if (!sub.hasProps) continue;
            const subTsPath = existsSync(join(componentsPath, c, sub.name, `${sub.name}.ts`))
              ? join(componentsPath, c, sub.name, `${sub.name}.ts`)
              : join(componentsPath, c, `${sub.name}.ts`);
            if (!existsSync(subTsPath)) continue;

            try {
              const subParsed = parseComponentProps(subTsPath);
              const subMatched = subParsed.props.filter(p => {
                const nameMatch = propName ? p.name.toLowerCase().includes(propName.toLowerCase()) : true;
                const typeMatch = propType ? p.type.toLowerCase().includes(propType.toLowerCase()) : true;
                return nameMatch && typeMatch;
              });
              if (subMatched.length > 0) {
                matches.push({
                  component: `${c}/${sub.name}`,
                  pascalName: sub.pascalName,
                  matchedProps: subMatched,
                });
              }
            } catch {
              // Skip
            }
          }
        } catch {
          // Skip components that fail to parse
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

      let result: unknown;

      switch (tokenType) {
        case 'colors':
          result = parseColors(assetsPath);
          break;
        case 'spacing':
          result = parseSpacing(assetsPath);
          break;
        case 'radius':
          result = parseBorderRadius(assetsPath);
          break;
        case 'maxWidth':
          result = parseMaxWidth(assetsPath);
          break;
        case 'utilities':
          result = parseUtilities(assetsPath);
          break;
        case 'all':
          result = getAllTokens(assetsPath);
          break;
        default:
          return {
            content: [
              {
                type: 'text',
                text: `Invalid token type "${tokenType}". Use one of: colors, spacing, radius, maxWidth, utilities, all`,
              },
            ],
            isError: true,
          };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'list_assets': {
      const imagesDir = join(assetsPath, 'images');
      const images: { name: string; path: string; type: string }[] = [];
      const emptyStates: { name: string; path: string; type: string }[] = [];

      if (existsSync(imagesDir)) {
        const entries = readdirSync(imagesDir);
        for (const entry of entries) {
          const fullPath = join(imagesDir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory() && entry === 'empty-states') {
            const esEntries = readdirSync(fullPath);
            for (const esEntry of esEntries) {
              const ext = extname(esEntry).slice(1);
              emptyStates.push({ name: esEntry.replace(extname(esEntry), ''), path: `images/empty-states/${esEntry}`, type: ext });
            }
          } else if (stat.isFile()) {
            const ext = extname(entry).slice(1);
            images.push({ name: entry.replace(extname(entry), ''), path: `images/${entry}`, type: ext });
          }
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ images, emptyStates }, null, 2) }],
      };
    }

    case 'get_store': {
      const storeName = (args as { name?: string })?.name;

      if (!existsSync(storesPath)) {
        return {
          content: [{ type: 'text', text: 'No stores directory found.' }],
          isError: true,
        };
      }

      const storeFiles = readdirSync(storesPath).filter(f => extname(f) === '.ts');

      if (storeName) {
        const storeFile = storeFiles.find(f => f.replace('.ts', '') === storeName || f === storeName || f === `${storeName}.ts`);
        if (!storeFile) {
          return {
            content: [{ type: 'text', text: `Store "${storeName}" not found. Available stores: ${storeFiles.map(f => f.replace('.ts', '')).join(', ')}` }],
            isError: true,
          };
        }
        const content = readFileSync(join(storesPath, storeFile), 'utf-8');
        return {
          content: [{ type: 'text', text: JSON.stringify({ name: storeFile.replace('.ts', ''), fileName: storeFile, source: content }, null, 2) }],
        };
      }

      // List all stores with source
      const stores = storeFiles.map(f => ({
        name: f.replace('.ts', ''),
        fileName: f,
        source: readFileSync(join(storesPath, f), 'utf-8'),
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify(stores, null, 2) }],
      };
    }

    default:
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Sprout Design System MCP server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
