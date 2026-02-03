import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpTestClient } from '../helpers/mcp-client.js';

describe('MCP Server Integration Tests', () => {
  let client: McpTestClient;

  beforeAll(async () => {
    client = new McpTestClient();
    await client.start();
    await client.initialize();
  });

  afterAll(async () => {
    await client.stop();
  });

  describe('tools/list', () => {
    it('returns all 8 tools', async () => {
      const response = await client.listTools();
      expect(response.result).toBeDefined();
      const result = response.result as { tools: Array<{ name: string }> };
      expect(result.tools).toHaveLength(8);
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain('list_components');
      expect(toolNames).toContain('get_component');
      expect(toolNames).toContain('search_components');
      expect(toolNames).toContain('search_by_prop');
      expect(toolNames).toContain('get_component_source');
      expect(toolNames).toContain('get_tokens');
      expect(toolNames).toContain('list_assets');
      expect(toolNames).toContain('get_store');
    });
  });

  describe('list_components', () => {
    it('returns all components with required fields', async () => {
      const result = await client.callTool('list_components');
      expect(result.isError).toBeFalsy();
      const components = JSON.parse(result.content[0].text);
      expect(Array.isArray(components)).toBe(true);
      expect(components.length).toBeGreaterThan(30);

      // Check structure of first component
      const first = components[0];
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('pascalName');
      expect(first).toHaveProperty('category');
      expect(first).toHaveProperty('propCount');
      expect(first).toHaveProperty('slotCount');
      expect(first).toHaveProperty('subComponentCount');
    });

    it('filters by category', async () => {
      const result = await client.callTool('list_components', { category: 'form' });
      expect(result.isError).toBeFalsy();
      const components = JSON.parse(result.content[0].text);
      expect(components.length).toBeGreaterThan(0);
      components.forEach((c: { category: string }) => {
        expect(c.category).toBe('form');
      });
    });

    it('returns empty array for invalid category', async () => {
      const result = await client.callTool('list_components', { category: 'nonexistent' });
      expect(result.isError).toBeFalsy();
      const components = JSON.parse(result.content[0].text);
      expect(components).toEqual([]);
    });
  });

  describe('get_component', () => {
    it('returns component details for button', async () => {
      const result = await client.callTool('get_component', { name: 'button' });
      expect(result.isError).toBeFalsy();
      const component = JSON.parse(result.content[0].text);

      expect(component.name).toBe('button');
      expect(component.pascalName).toBe('Button');
      expect(component.category).toBe('form');
      expect(Array.isArray(component.props)).toBe(true);
      expect(Array.isArray(component.slots)).toBe(true);
      expect(component.usageExample).toContain('SprButton');
    });

    it('returns error for invalid component', async () => {
      const result = await client.callTool('get_component', { name: 'nonexistent' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('handles case-insensitive component names', async () => {
      const result = await client.callTool('get_component', { name: 'Button' });
      expect(result.isError).toBeFalsy();
      const component = JSON.parse(result.content[0].text);
      expect(component.name).toBe('button');
    });
  });

  describe('search_components', () => {
    it('finds components by name', async () => {
      const result = await client.callTool('search_components', { query: 'button' });
      expect(result.isError).toBeFalsy();
      const matches = JSON.parse(result.content[0].text);
      expect(matches.length).toBeGreaterThan(0);
      const hasButton = matches.some((m: { name: string }) => m.name === 'button');
      expect(hasButton).toBe(true);
    });

    it('finds components by partial name', async () => {
      const result = await client.callTool('search_components', { query: 'date' });
      expect(result.isError).toBeFalsy();
      const matches = JSON.parse(result.content[0].text);
      expect(matches.length).toBeGreaterThan(0);
      const hasDatePicker = matches.some((m: { name: string }) => m.name === 'date-picker');
      expect(hasDatePicker).toBe(true);
    });

    it('returns empty array for no matches', async () => {
      const result = await client.callTool('search_components', { query: 'zzzznonexistent' });
      expect(result.isError).toBeFalsy();
      const matches = JSON.parse(result.content[0].text);
      expect(matches).toEqual([]);
    });

    it('searches across prop names', async () => {
      const result = await client.callTool('search_components', { query: 'disabled' });
      expect(result.isError).toBeFalsy();
      const matches = JSON.parse(result.content[0].text);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  describe('search_by_prop', () => {
    it('finds components by propName', async () => {
      const result = await client.callTool('search_by_prop', { propName: 'disabled' });
      expect(result.isError).toBeFalsy();
      const matches = JSON.parse(result.content[0].text);
      expect(matches.length).toBeGreaterThan(0);
      matches.forEach((m: { matchedProps: Array<{ name: string }> }) => {
        const hasProp = m.matchedProps.some((p) => p.name.includes('disabled'));
        expect(hasProp).toBe(true);
      });
    });

    it('finds components by propType', async () => {
      const result = await client.callTool('search_by_prop', { propType: 'boolean' });
      expect(result.isError).toBeFalsy();
      const matches = JSON.parse(result.content[0].text);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('returns error when no arguments provided', async () => {
      const result = await client.callTool('search_by_prop', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('At least one');
    });

    it('combines propName and propType filters', async () => {
      const result = await client.callTool('search_by_prop', {
        propName: 'disabled',
        propType: 'boolean',
      });
      expect(result.isError).toBeFalsy();
      const matches = JSON.parse(result.content[0].text);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  describe('get_component_source', () => {
    it('returns source files for button', async () => {
      const result = await client.callTool('get_component_source', { name: 'button' });
      expect(result.isError).toBeFalsy();
      const files = JSON.parse(result.content[0].text);
      expect(typeof files).toBe('object');
      const fileNames = Object.keys(files);
      expect(fileNames.length).toBeGreaterThan(0);
      // Should have at least .vue or .ts files
      const hasVueOrTs = fileNames.some((f) => f.endsWith('.vue') || f.endsWith('.ts'));
      expect(hasVueOrTs).toBe(true);
    });

    it('returns error for invalid component', async () => {
      const result = await client.callTool('get_component_source', { name: 'nonexistent' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('get_tokens', () => {
    it('returns colors tokens', async () => {
      const result = await client.callTool('get_tokens', { type: 'colors' });
      expect(result.isError).toBeFalsy();
      const tokens = JSON.parse(result.content[0].text);
      expect(Array.isArray(tokens) || typeof tokens === 'object').toBe(true);
    });

    it('returns spacing tokens', async () => {
      const result = await client.callTool('get_tokens', { type: 'spacing' });
      expect(result.isError).toBeFalsy();
      const tokens = JSON.parse(result.content[0].text);
      expect(Array.isArray(tokens) || typeof tokens === 'object').toBe(true);
    });

    it('returns radius tokens', async () => {
      const result = await client.callTool('get_tokens', { type: 'radius' });
      expect(result.isError).toBeFalsy();
      const tokens = JSON.parse(result.content[0].text);
      expect(Array.isArray(tokens) || typeof tokens === 'object').toBe(true);
    });

    it('returns all tokens', async () => {
      const result = await client.callTool('get_tokens', { type: 'all' });
      expect(result.isError).toBeFalsy();
      const tokens = JSON.parse(result.content[0].text);
      expect(tokens).toHaveProperty('colors');
      expect(tokens).toHaveProperty('spacing');
      expect(tokens).toHaveProperty('borderRadius');
    });

    it('returns error for invalid token type', async () => {
      const result = await client.callTool('get_tokens', { type: 'invalid' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid token type');
    });
  });

  describe('list_assets', () => {
    it('returns images and emptyStates arrays', async () => {
      const result = await client.callTool('list_assets');
      expect(result.isError).toBeFalsy();
      const assets = JSON.parse(result.content[0].text);
      expect(assets).toHaveProperty('images');
      expect(assets).toHaveProperty('emptyStates');
      expect(Array.isArray(assets.images)).toBe(true);
      expect(Array.isArray(assets.emptyStates)).toBe(true);
    });

    it('assets have required structure', async () => {
      const result = await client.callTool('list_assets');
      const assets = JSON.parse(result.content[0].text);

      if (assets.images.length > 0) {
        const image = assets.images[0];
        expect(image).toHaveProperty('name');
        expect(image).toHaveProperty('path');
        expect(image).toHaveProperty('type');
      }

      if (assets.emptyStates.length > 0) {
        const emptyState = assets.emptyStates[0];
        expect(emptyState).toHaveProperty('name');
        expect(emptyState).toHaveProperty('path');
        expect(emptyState).toHaveProperty('type');
      }
    });
  });

  describe('get_store', () => {
    it('lists all stores when no name provided', async () => {
      const result = await client.callTool('get_store');
      expect(result.isError).toBeFalsy();
      const stores = JSON.parse(result.content[0].text);
      expect(Array.isArray(stores)).toBe(true);
      if (stores.length > 0) {
        expect(stores[0]).toHaveProperty('name');
        expect(stores[0]).toHaveProperty('fileName');
      }
    });

    it('returns store source by name', async () => {
      // First get list to find a store name
      const listResult = await client.callTool('get_store');
      const stores = JSON.parse(listResult.content[0].text);

      if (stores.length > 0) {
        const storeName = stores[0].name;
        const result = await client.callTool('get_store', { name: storeName });
        expect(result.isError).toBeFalsy();
        const store = JSON.parse(result.content[0].text);
        expect(store).toHaveProperty('name');
        expect(store).toHaveProperty('fileName');
        expect(store).toHaveProperty('source');
        expect(typeof store.source).toBe('string');
      }
    });

    it('returns error for invalid store name', async () => {
      const result = await client.callTool('get_store', { name: 'nonexistent' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });
});
