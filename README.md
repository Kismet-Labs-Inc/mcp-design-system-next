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

## How It Works

The server parses the installed `design-system-next` npm package source code using `ts-morph` (TypeScript AST) to provide:

- **Structured prop extraction** — Handles `PropType<T>` casts, arrow function defaults, validators, JSDoc `@description` tags, and `const` array valid values
- **Emit parsing** — Extracts event names and payload types from emit type declarations
- **Type extraction** — Exports all interfaces, type aliases, and const assertions
- **Sub-component discovery** — Recursively finds nested directories and flat `.vue` sub-components
- **Composable analysis** — Parses `use-*.ts` hooks for function signatures and returned members
- **Design token parsing** — Reads color, spacing, border-radius, max-width, and utility token files
- **Asset listing** — Enumerates available images and empty-state illustrations
- **Store access** — Returns Pinia store source code

All parsing is done locally against the installed package with zero network dependencies.

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

## Dependencies

- `@modelcontextprotocol/sdk` - MCP SDK for building servers
- `design-system-next` - Sprout Design System Vue component library
- `ts-morph` - TypeScript AST analysis for structured prop/type extraction

## License

MIT
