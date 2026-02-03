# mcp-design-system-next

An MCP (Model Context Protocol) server that provides AI assistants with deep, structured access to the Sprout Design System (`design-system-next`) component library. Uses AST parsing with `ts-morph` to extract typed props, emits, types, composable signatures, and more from the installed package source.

## Installation

```bash
npm install mcp-design-system-next
```

Or run directly with npx:

```bash
npx mcp-design-system-next
```

## Configuration

Add to your MCP configuration file (`.mcp.json` or Claude Code settings):

```json
{
  "mcpServers": {
    "design-system-next": {
      "command": "npx",
      "args": ["mcp-design-system-next"]
    }
  }
}
```

## Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_components` | List all components with sub-component counts, optionally filtered by category | `category` (optional) |
| `get_component` | Get detailed info: props, emits, types, sub-components, composables, and usage example | `name` (required) |
| `get_component_source` | Get raw `.ts`/`.vue` source files for a component and its sub-components | `name` (required) |
| `search_components` | Search components by keyword across names, categories, sub-components, and prop names | `query` (required) |
| `search_by_prop` | Find components that have a specific prop name or prop type | `propName` (optional), `propType` (optional) |
| `get_tokens` | Get design tokens (colors, spacing, border-radius, utilities, etc.) | `type` (required) |
| `list_assets` | List available image assets and empty-state illustrations | none |
| `get_store` | Get Pinia store source code; omit name to list all stores | `name` (optional) |

### Component Categories

Use these with `list_components`:

| Category | Components |
|----------|------------|
| `form` | button, checkbox, input, radio, select, slider, switch, textarea, file-upload, date-picker, time-picker |
| `layout` | accordion, card, collapsible, sidenav, sidepanel, tabs, modal |
| `data` | avatar, badge, banner, calendar, calendar-cell, chips, empty-state, list, lozenge, progress-bar, status, table, audit-trail |
| `feedback` | snackbar, tooltip, popper |
| `navigation` | dropdown, stepper, floating-action |
| `filter` | attribute-filter, filter |
| `utility` | icon, logo |

### Token Types

Use these with `get_tokens`:

| Type | Description |
|------|-------------|
| `colors` | Color palette |
| `spacing` | Spacing scale |
| `radius` | Border radius values |
| `maxWidth` | Max-width constraints |
| `utilities` | Utility classes (e.g., bg-overlay) |
| `all` | All tokens combined |

## What `get_component` Returns

For each component, the server returns structured JSON including:

- **props** — Name, type, default value, description, valid values, required flag, and validator text
- **emits** — Event name and payload type
- **types** — Exported interfaces, type aliases, and const arrays from the component's `.ts` file
- **subComponents** — Nested and flat sub-components with their own props and emits
- **composables** — `use-*.ts` hook signatures and returned members
- **template** — Vue template markup
- **usageExample** — Auto-generated Vue SFC usage snippet

## Example Prompts

### Component Discovery

- "What form components are available in the design system?"
- "List all data display components"
- "Search for any date-related components"
- "What components can I use for navigation?"

### Component Details

- "How do I use the Button component? Show me the props"
- "What props does the Modal component accept?"
- "Show me a usage example for the Select component"
- "What events does the DatePicker emit?"
- "Show me the raw source code for the Table component"

### Sub-Components and Composables

- "What sub-components does the Table have?"
- "What does the useTable composable return?"
- "Show me the props for table-pagination"

### Prop-Based Search

- "Which components have a `disabled` prop?"
- "Find all components that accept a boolean prop"
- "What components have a `modelValue` prop?"

### Building Features

- "Build a login form using the design system components"
- "Create a settings page with a sidepanel and form inputs"
- "I need a data table with filtering - what components should I use?"
- "Help me create a user profile card with avatar and badge"

### Design Tokens

- "What colors are available in the design system?"
- "Show me the spacing scale"
- "What border-radius values can I use?"
- "Get all the design tokens for my Tailwind config"
- "What utility tokens are available?"

### Assets and Stores

- "What empty-state illustrations are available?"
- "Show me the snackbar store source code"

### Migration/Comparison

- "Does the design system have a tooltip component? Show me how to use it"
- "I'm using a React Dialog - what's the equivalent in design-system-next?"
- "Compare the Table component props with what I'm using in shadcn"

### Code Generation

- "Generate a Vue component for a filter bar using design-system-next"
- "Write a dashboard layout using Card, Tabs, and Table from the design system"
- "Create a feedback form with Input, Textarea, and Button"

## Technical Architecture

### How Parsing Works

The server resolves the `design-system-next` package location at startup via Node's `createRequire` and reads source files directly from `node_modules/design-system-next/src/`. All parsing happens locally with zero network calls.

#### AST-Based Prop Extraction (ts-morph)

The props parser (`src/parsers/props-parser.ts`) uses [ts-morph](https://ts-morph.com/) to build a TypeScript AST from each component's `.ts` file. A shared `Project` instance is lazily initialized once and reused across all parse calls for the server's lifetime.

For each `*PropTypes` export, the parser walks the object literal's property assignments and extracts:

- **Type** — Resolves `PropType<T>` cast expressions (e.g., `Array as PropType<Header[]>` becomes `Header[]`), and maps Vue constructor types (`String`, `Boolean`, `Number`) to their lowercase equivalents
- **Default** — Captures the full initializer text, including arrow functions like `() => ({ min: 1900, max: new Date().getFullYear() })` and expressions like `new Date().getFullYear().toString()`
- **Validator** — Extracts the full validator function text
- **Valid values** — Cross-references `const` array assertions (e.g., `const TABLE_SORT = ['asc', 'desc'] as const`) by matching `typeof X` references in `PropType<>` casts and `.includes()` calls in validators
- **Required** — Reads the `required: true/false` property
- **Description** — Extracts `@description` tags from leading JSDoc comments

This approach is significantly more accurate than regex-based parsing. The old regex parser failed on multi-line defaults, nested objects, complex `PropType<>` expressions, and validators that referenced const arrays. The AST parser handles all of these correctly.

#### Type Extraction

The type parser (`src/parsers/type-parser.ts`) reuses the same ts-morph `Project` and extracts all exported type aliases, interfaces, and const assertions from a component's `.ts` file. This gives the AI assistant full visibility into types like `Header`, `TableData`, `DisabledDatesType`, etc., which are essential for generating correct code.

#### Sub-Component Discovery

Components in `design-system-next` follow two sub-component patterns:

1. **Nested directories** — e.g., `table/table-actions/table-actions.vue` with an optional `.ts` file for props
2. **Flat files** — e.g., `sidenav/sidenav-loader.vue` where a `.vue` file in the component root has a different name than the component itself
3. **PascalCase files in subdirectories** — e.g., `date-picker/tabs/DatePickerCalendarTab.vue`

The discovery function (`getSubComponents`) scans for all three patterns and reports whether each sub-component has a `.ts` file (and therefore parseable props).

#### Composable Analysis

The composable parser (`src/parsers/composable-parser.ts`) finds `use-*.ts` files in each component directory and extracts:

- The exported function name (e.g., `useTable`, `useDraggableTableRows`)
- The full parameter signature including types (e.g., `(props: TablePropTypes, emit: SetupContext<TableEmitTypes>['emit'], slots: Slots)`)
- The list of returned members from the final `return { ... }` block

This uses regex rather than ts-morph since composable return statements are structurally simple and the regex approach avoids the overhead of full AST resolution for these files.

#### Token Parsing

Design tokens are extracted from `src/assets/scripts/*.ts` files using regex matching against known object patterns (`colorScheme`, `spacing`, `borderRadius`, `maxWidth`, `utilities`). This is simpler than AST parsing since token files follow consistent, flat structures.

### Caching Behavior

ts-morph's `Project` instance caches source files in memory after the first parse. This means:

- Subsequent calls to `get_component` or `search_by_prop` for the same component are fast
- If the `design-system-next` package is updated via `npm install`, the server must be **restarted** to pick up changes

### How This Compares to shadcn/ui MCP Servers

The [official shadcn MCP server](https://ui.shadcn.com/docs/mcp) and community alternatives (e.g., [Jpisnice/shadcn-ui-mcp-server](https://github.com/Jpisnice/shadcn-ui-mcp-server), [magnusrodseth/shadcn-mcp-server](https://github.com/magnusrodseth/shadcn-mcp-server)) take a fundamentally different approach.

#### Data Source

| | shadcn MCP servers | This server |
|---|---|---|
| **Source** | Fetch raw source from GitHub API or registry HTTP endpoints at runtime | Read from locally installed `node_modules` on disk |
| **Network** | Required (subject to GitHub rate limits: 60 req/hr unauthenticated, 5000 authenticated) | None — fully offline |
| **Freshness** | Always fetches latest from upstream repo | Tied to the installed npm version; restart after `npm update` |

#### Parsing Strategy

| | shadcn MCP servers | This server |
|---|---|---|
| **Approach** | No parsing — returns raw source code and lets the LLM interpret it | AST parsing with ts-morph — returns structured JSON with typed fields |
| **Props** | LLM must read and understand the source to identify props | Pre-extracted with name, type, default, validator, valid values, description |
| **Types** | Embedded in the raw source; LLM must locate and interpret them | Extracted as separate structured entries with kind (type/interface/const-array) |
| **Sub-components** | Not specifically identified | Automatically discovered and returned with their own parsed props |
| **Composables** | Not analyzed | Signatures and returned members extracted |

#### Tool Coverage

| Tool | shadcn (official) | shadcn (community) | This server |
|---|---|---|---|
| List components | Registry browse | `list_components` | `list_components` (+ sub-component counts) |
| Component detail | Via registry | `get_component` (raw source) | `get_component` (structured props/emits/types/composables) |
| Raw source access | — | Yes | `get_component_source` |
| Search by keyword | Registry search | — | `search_components` (names, categories, sub-components, prop names) |
| Search by prop | — | — | `search_by_prop` |
| Design tokens | — | — | `get_tokens` |
| Assets | — | — | `list_assets` |
| Stores | — | — | `get_store` |
| Install components | Yes (via shadcn CLI) | — | — |
| Blocks/templates | Yes | Some | — |

### Pros

- **Structured output reduces hallucination** — The AI receives typed, validated JSON rather than raw source code it must interpret. Prop types, defaults, and valid values are unambiguous.
- **Prop-level search** — `search_by_prop` enables queries like "which components accept a disabled prop?" that no shadcn MCP server supports.
- **Zero network dependency** — No API rate limits, no latency, works offline and in air-gapped environments.
- **Deep component introspection** — Sub-components, composable signatures, exported types, and design tokens are all surfaced in a single `get_component` call.
- **Fast after first parse** — ts-morph caches the AST in memory, so repeated queries are near-instant.

### Cons

- **Coupled to the installed version** — The server only sees what's in `node_modules`. After `npm update`, the server must be restarted. shadcn servers always fetch the latest from GitHub.
- **No install capability** — The official shadcn server can install components via the CLI. This server is read-only.
- **No blocks/templates** — shadcn servers serve pre-built page layouts and templates. This server focuses on individual components and their APIs.
- **ts-morph adds weight** — The `ts-morph` dependency (which bundles the TypeScript compiler) adds ~80 MB to `node_modules`. shadcn servers that simply fetch from GitHub have no heavy dependencies.
- **Regex fallback for some parsers** — Composable and token parsing use regex rather than AST. This works for the current design system's patterns but could break if the file structure changes significantly.
- **Manual category mapping** — Component categories are hardcoded in `index.ts` rather than derived from the source. New components added to the design system won't have a category until the mapping is updated.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev

# Start the server
npm start
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode during development
npm run test:watch
```

The test suite includes:
- **Unit tests** for utility functions (toPascalCase, generateUsageExample, etc.)
- **Integration tests** for all 8 MCP tools via JSON-RPC over stdio

## Dependencies

- `@modelcontextprotocol/sdk` - MCP SDK for building servers
- `design-system-next` - Sprout Design System Vue component library
- `ts-morph` - TypeScript AST analysis for structured prop/type extraction

## License

MIT
