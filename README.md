# mcp-design-system-next

An MCP (Model Context Protocol) server that provides AI assistants with access to the Sprout Design System (`design-system-next`) component library.

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
| `list_components` | List all components, optionally filtered by category | `category` (optional) |
| `get_component` | Get detailed info about a component (props, emits, usage example) | `name` (required) |
| `search_components` | Search components by keyword | `query` (required) |
| `get_tokens` | Get design tokens (colors, spacing, etc.) | `type` (required) |

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
| `all` | All tokens combined |

## Example Prompts

Here are example prompts you can give an AI assistant that will utilize this MCP server:

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

### Migration/Comparison

- "Does the design system have a tooltip component? Show me how to use it"
- "I'm using a React Dialog - what's the equivalent in design-system-next?"
- "Compare the Table component props with what I'm using in shadcn"

### Code Generation

- "Generate a Vue component for a filter bar using design-system-next"
- "Write a dashboard layout using Card, Tabs, and Table from the design system"
- "Create a feedback form with Input, Textarea, and Button"

## How It Works

The server parses the actual `design-system-next` npm package source code to provide:

- Component props with types, defaults, and descriptions
- Component emits (events) with payload types
- Vue template structure
- Auto-generated usage examples

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

## License

MIT
