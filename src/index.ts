#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { parseComponentProps, getComponentNameFromPath, type PropDefinition } from './parsers/props-parser.js';
import { parseVueFile, generateUsageExample } from './parsers/vue-parser.js';
import { getAllTokens, parseColors, parseSpacing, parseBorderRadius, parseMaxWidth } from './parsers/token-parser.js';

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

// Create the MCP server
const server = new Server(
  {
    name: 'mcp-design-system-next',
    version: '1.0.0',
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
        name: 'get_tokens',
        description: 'Get design tokens (colors, spacing, border-radius, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['colors', 'spacing', 'radius', 'maxWidth', 'all'],
              description: 'Type of tokens to retrieve',
            },
          },
          required: ['type'],
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

      const result = components.map(c => ({
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

      if (existsSync(tsFile)) {
        const parsed = parseComponentProps(tsFile);
        props = parsed.props;
        emits = parsed.emits;
      }

      let template = '';
      if (existsSync(vueFile)) {
        const vue = parseVueFile(vueFile);
        template = vue.template;
      }

      const pascalName = getComponentNameFromPath(componentDir);
      const example = generateUsageExample(pascalName, props);

      const result = {
        name: componentName,
        pascalName,
        category: getComponentCategory(componentName),
        props,
        emits,
        template,
        usageExample: example,
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

      const matches = components.filter(c =>
        c.toLowerCase().includes(query) ||
        getComponentNameFromPath(join(componentsPath, c)).toLowerCase().includes(query)
      );

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
        case 'all':
          result = getAllTokens(assetsPath);
          break;
        default:
          return {
            content: [
              {
                type: 'text',
                text: `Invalid token type "${tokenType}". Use one of: colors, spacing, radius, maxWidth, all`,
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
