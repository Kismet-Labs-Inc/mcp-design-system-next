import { describe, it, expect } from 'vitest';
import { toPascalCase, getComponentCategory, generateUsageExample } from '../../src/utils.js';
import type { PropDefinition, SlotDefinition } from '../../src/types.js';

describe('toPascalCase', () => {
  it('converts simple kebab-case to PascalCase', () => {
    expect(toPascalCase('button')).toBe('Button');
  });

  it('converts multi-word kebab-case to PascalCase', () => {
    expect(toPascalCase('date-picker')).toBe('DatePicker');
  });

  it('handles three-word kebab-case', () => {
    expect(toPascalCase('file-upload-button')).toBe('FileUploadButton');
  });

  it('handles empty string', () => {
    expect(toPascalCase('')).toBe('');
  });

  it('handles single character', () => {
    expect(toPascalCase('a')).toBe('A');
  });
});

describe('getComponentCategory', () => {
  it('returns "form" for button', () => {
    expect(getComponentCategory('button')).toBe('form');
  });

  it('returns "form" for input', () => {
    expect(getComponentCategory('input')).toBe('form');
  });

  it('returns "form" for date-picker', () => {
    expect(getComponentCategory('date-picker')).toBe('form');
  });

  it('returns "data" for table', () => {
    expect(getComponentCategory('table')).toBe('data');
  });

  it('returns "data" for avatar', () => {
    expect(getComponentCategory('avatar')).toBe('data');
  });

  it('returns "layout" for modal', () => {
    expect(getComponentCategory('modal')).toBe('layout');
  });

  it('returns "layout" for tabs', () => {
    expect(getComponentCategory('tabs')).toBe('layout');
  });

  it('returns "feedback" for snackbar', () => {
    expect(getComponentCategory('snackbar')).toBe('feedback');
  });

  it('returns "feedback" for tooltip', () => {
    expect(getComponentCategory('tooltip')).toBe('feedback');
  });

  it('returns "navigation" for dropdown', () => {
    expect(getComponentCategory('dropdown')).toBe('navigation');
  });

  it('returns "filter" for attribute-filter', () => {
    expect(getComponentCategory('attribute-filter')).toBe('filter');
  });

  it('returns "utility" for icon', () => {
    expect(getComponentCategory('icon')).toBe('utility');
  });

  it('returns "other" for unknown component', () => {
    expect(getComponentCategory('unknown-component')).toBe('other');
  });

  it('returns "other" for empty string', () => {
    expect(getComponentCategory('')).toBe('other');
  });
});

describe('generateUsageExample', () => {
  it('generates example with no props and no slots', () => {
    const result = generateUsageExample('Button', [], []);
    expect(result).toContain('<SprButton>');
    expect(result).toContain('</SprButton>');
    expect(result).toContain("import { SprButton } from 'design-system-next'");
    expect(result).toContain('<!-- Content -->');
  });

  it('generates example with boolean prop', () => {
    const props: PropDefinition[] = [{ name: 'disabled', type: 'boolean' }];
    const result = generateUsageExample('Button', props, []);
    expect(result).toContain('<SprButton disabled>');
  });

  it('generates example with string prop and validValues', () => {
    const props: PropDefinition[] = [
      { name: 'variant', type: 'string', validValues: ['primary', 'secondary', 'tertiary'] },
    ];
    const result = generateUsageExample('Button', props, []);
    expect(result).toContain('variant="primary"');
  });

  it('generates example with string prop without validValues', () => {
    const props: PropDefinition[] = [{ name: 'label', type: 'string' }];
    const result = generateUsageExample('Button', props, []);
    expect(result).toContain('label="example"');
  });

  it('skips props with defaults and no validValues', () => {
    const props: PropDefinition[] = [
      { name: 'disabled', type: 'boolean', default: 'false' },
      { name: 'loading', type: 'boolean' },
    ];
    const result = generateUsageExample('Button', props, []);
    expect(result).toContain('loading');
    expect(result).not.toContain('disabled');
  });

  it('limits props to first 3', () => {
    const props: PropDefinition[] = [
      { name: 'prop1', type: 'boolean' },
      { name: 'prop2', type: 'boolean' },
      { name: 'prop3', type: 'boolean' },
      { name: 'prop4', type: 'boolean' },
    ];
    const result = generateUsageExample('Button', props, []);
    expect(result).toContain('prop1');
    expect(result).toContain('prop2');
    expect(result).toContain('prop3');
    expect(result).not.toContain('prop4');
  });

  it('generates example with default slot only', () => {
    const slots: SlotDefinition[] = [{ name: 'default', scoped: false }];
    const result = generateUsageExample('Button', [], slots);
    expect(result).toContain('<!-- Default slot content -->');
    expect(result).not.toContain('<template #default>');
  });

  it('generates example with named slots', () => {
    const slots: SlotDefinition[] = [
      { name: 'header', scoped: false },
      { name: 'footer', scoped: false },
    ];
    const result = generateUsageExample('Card', [], slots);
    expect(result).toContain('<template #header>');
    expect(result).toContain('<!-- header content -->');
    expect(result).toContain('<template #footer>');
    expect(result).toContain('<!-- footer content -->');
  });

  it('generates example with scoped slots', () => {
    const slots: SlotDefinition[] = [
      { name: 'item', scoped: true, scopeProps: ['item', 'index'] },
    ];
    const result = generateUsageExample('List', [], slots);
    expect(result).toContain('<template #item="{ item, index }">');
    expect(result).toContain('<!-- item content -->');
  });

  it('generates example with default and named slots', () => {
    const slots: SlotDefinition[] = [
      { name: 'default', scoped: false },
      { name: 'actions', scoped: false },
    ];
    const result = generateUsageExample('Card', [], slots);
    expect(result).toContain('<template #default>');
    expect(result).toContain('<!-- Default slot content -->');
    expect(result).toContain('<template #actions>');
  });

  it('limits named slots to first 2', () => {
    const slots: SlotDefinition[] = [
      { name: 'slot1', scoped: false },
      { name: 'slot2', scoped: false },
      { name: 'slot3', scoped: false },
    ];
    const result = generateUsageExample('Component', [], slots);
    expect(result).toContain('<template #slot1>');
    expect(result).toContain('<template #slot2>');
    expect(result).not.toContain('<template #slot3>');
  });

  it('handles non-boolean, non-string props by returning null (filtered out)', () => {
    const props: PropDefinition[] = [
      { name: 'items', type: 'Array' },
      { name: 'label', type: 'string' },
    ];
    const result = generateUsageExample('List', props, []);
    expect(result).toContain('label="example"');
    expect(result).not.toContain('items=');
  });
});
