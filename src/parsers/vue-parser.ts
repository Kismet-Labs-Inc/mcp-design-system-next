import { readFileSync } from 'fs';

export interface VueComponentTemplate {
  template: string;
  script: string;
  styles?: string;
}

/**
 * Parse a Vue SFC file to extract template, script, and styles
 */
export function parseVueFile(vueFilePath: string): VueComponentTemplate {
  const content = readFileSync(vueFilePath, 'utf-8');

  // Extract template
  const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/);
  const template = templateMatch ? templateMatch[1].trim() : '';

  // Extract script
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  const script = scriptMatch ? scriptMatch[1].trim() : '';

  // Extract styles (optional)
  const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  const styles = styleMatch ? styleMatch[1].trim() : undefined;

  return { template, script, styles };
}

/**
 * Generate a basic usage example for a component
 */
export function generateUsageExample(
  componentName: string,
  props: Array<{ name: string; type: string; default?: string; validValues?: string[] }>
): string {
  const kebabName = componentName
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();

  // Build props string with example values
  const propsStr = props
    .filter(p => !p.default || p.validValues) // Only show props that are required or have interesting values
    .slice(0, 3) // Limit to first 3 props for brevity
    .map(p => {
      if (p.type === 'boolean') {
        return p.name;
      }
      if (p.validValues && p.validValues.length > 0) {
        return `${p.name}="${p.validValues[0]}"`;
      }
      if (p.type === 'string') {
        return `${p.name}="example"`;
      }
      return null;
    })
    .filter(Boolean)
    .join(' ');

  const propsSection = propsStr ? ` ${propsStr}` : '';

  return `<template>
  <Spr${componentName}${propsSection}>
    <!-- Content -->
  </Spr${componentName}>
</template>

<script setup>
import { Spr${componentName} } from 'design-system-next';
</script>`;
}
