#!/usr/bin/env node

/**
 * Build-time manifest generator.
 *
 * Pre-parses all design-system-next components into a compact JSON manifest
 * so the MCP server can serve documentation without runtime file I/O or
 * AST parsing on every request.
 *
 * Run: npx tsx src/generate-manifest.ts
 * Or:  npm run generate-manifest
 */

import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from 'fs';
import { join, dirname, extname } from 'path';
import { createRequire } from 'module';

import { parseComponentProps, getComponentNameFromPath, type PropDefinition, type EmitDefinition } from './parsers/props-parser.js';
import { parseSlots, type SlotDefinition } from './parsers/slot-parser.js';
import { parseComposable, type ComposableInfo } from './parsers/composable-parser.js';
import { parseTypes, type TypeDefinition } from './parsers/type-parser.js';
import { getAllTokens, type DesignTokens } from './parsers/token-parser.js';

// ── Resolve design-system-next paths ──────────────────────────────────

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
const assetsPath = join(designSystemPath, 'src', 'assets');
const storesPath = join(designSystemPath, 'src', 'stores');

// ── Helpers (duplicated from index.ts to keep the script standalone) ──

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

interface SubComponentMeta {
  name: string;
  pascalName: string;
  hasProps: boolean;
}

function getSubComponents(componentDir: string, componentName: string): SubComponentMeta[] {
  const subs: SubComponentMeta[] = [];
  if (!existsSync(componentDir)) return subs;

  const entries = readdirSync(componentDir);
  for (const entry of entries) {
    const fullPath = join(componentDir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      const subTsFile = join(fullPath, `${entry}.ts`);
      const subVueFile = join(fullPath, `${entry}.vue`);
      const hasTs = existsSync(subTsFile);
      const hasVue = existsSync(subVueFile);

      const innerEntries = readdirSync(fullPath);
      const innerVues = innerEntries.filter(e => extname(e) === '.vue');

      if (hasTs || hasVue) {
        subs.push({ name: entry, pascalName: toPascalCase(entry), hasProps: hasTs });
      } else if (innerVues.length > 0) {
        for (const vue of innerVues) {
          const vueName = vue.replace('.vue', '');
          subs.push({ name: vueName, pascalName: vueName, hasProps: false });
        }
      }
    } else if (extname(entry) === '.vue') {
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
    if (components.includes(name)) return category;
  }
  return 'other';
}

// ── Manifest types ────────────────────────────────────────────────────

interface SubComponentManifest {
  name: string;
  pascalName: string;
  props: PropDefinition[];
  emits: EmitDefinition[];
  slots: SlotDefinition[];
}

interface ComponentManifest {
  name: string;
  pascalName: string;
  category: string;
  props: PropDefinition[];
  emits: EmitDefinition[];
  slots: SlotDefinition[];
  types: TypeDefinition[];
  composables: ComposableInfo[];
  subComponents: SubComponentManifest[];
}

interface StoreManifest {
  name: string;
  fileName: string;
  source: string;
}

interface Manifest {
  version: string;
  generatedAt: string;
  designSystemVersion: string;
  components: ComponentManifest[];
  tokens: DesignTokens;
  stores: StoreManifest[];
  assets: {
    images: { name: string; path: string; type: string }[];
    emptyStates: { name: string; path: string; type: string }[];
  };
}

// ── Build the manifest ────────────────────────────────────────────────

function buildManifest(): Manifest {
  // Read design-system-next version
  const dsPkgPath = join(designSystemPath, 'package.json');
  const dsPkg = JSON.parse(readFileSync(dsPkgPath, 'utf-8'));
  const dsVersion: string = dsPkg.version ?? 'unknown';

  // Components
  const componentDirs = readdirSync(componentsPath).filter(name => {
    const fullPath = join(componentsPath, name);
    return statSync(fullPath).isDirectory();
  });

  const components: ComponentManifest[] = [];

  for (const componentName of componentDirs) {
    const componentDir = join(componentsPath, componentName);
    const tsFile = join(componentDir, `${componentName}.ts`);
    const vueFile = join(componentDir, `${componentName}.vue`);

    let props: PropDefinition[] = [];
    let emits: EmitDefinition[] = [];
    let types: TypeDefinition[] = [];

    if (existsSync(tsFile)) {
      try {
        const parsed = parseComponentProps(tsFile);
        props = parsed.props;
        emits = parsed.emits;
        types = parseTypes(tsFile);
      } catch (err) {
        console.error(`  Warning: failed to parse props for ${componentName}:`, (err as Error).message);
      }
    }

    let slots: SlotDefinition[] = [];
    if (existsSync(vueFile)) {
      try {
        slots = parseSlots(vueFile);
      } catch (err) {
        console.error(`  Warning: failed to parse slots for ${componentName}:`, (err as Error).message);
      }
    }

    // Composables
    const composables: ComposableInfo[] = [];
    const dirEntries = readdirSync(componentDir);
    for (const entry of dirEntries) {
      if (entry.startsWith('use-') && entry.endsWith('.ts')) {
        try {
          composables.push(parseComposable(join(componentDir, entry)));
        } catch (err) {
          console.error(`  Warning: failed to parse composable ${entry} for ${componentName}:`, (err as Error).message);
        }
      }
    }

    // Sub-components
    const subs = getSubComponents(componentDir, componentName);
    const subComponentDetails: SubComponentManifest[] = subs.map(sub => {
      let subProps: PropDefinition[] = [];
      let subEmits: EmitDefinition[] = [];
      let subSlots: SlotDefinition[] = [];

      if (sub.hasProps) {
        const subTsPath = existsSync(join(componentDir, sub.name, `${sub.name}.ts`))
          ? join(componentDir, sub.name, `${sub.name}.ts`)
          : join(componentDir, `${sub.name}.ts`);
        if (existsSync(subTsPath)) {
          try {
            const parsed = parseComponentProps(subTsPath);
            subProps = parsed.props;
            subEmits = parsed.emits;
          } catch {
            // Skip
          }
        }
      }

      // Check for sub-component Vue file for slots
      const subVuePath = existsSync(join(componentDir, sub.name, `${sub.name}.vue`))
        ? join(componentDir, sub.name, `${sub.name}.vue`)
        : join(componentDir, `${sub.name}.vue`);
      if (existsSync(subVuePath)) {
        try {
          subSlots = parseSlots(subVuePath);
        } catch {
          // Skip
        }
      }

      return {
        name: sub.name,
        pascalName: sub.pascalName,
        props: subProps,
        emits: subEmits,
        slots: subSlots,
      };
    });

    components.push({
      name: componentName,
      pascalName: getComponentNameFromPath(componentDir),
      category: getComponentCategory(componentName),
      props,
      emits,
      slots,
      types,
      composables,
      subComponents: subComponentDetails,
    });
  }

  // Tokens
  const tokens = getAllTokens(assetsPath);

  // Stores
  const stores: StoreManifest[] = [];
  if (existsSync(storesPath)) {
    const storeFiles = readdirSync(storesPath).filter(f => extname(f) === '.ts');
    for (const f of storeFiles) {
      stores.push({
        name: f.replace('.ts', ''),
        fileName: f,
        source: readFileSync(join(storesPath, f), 'utf-8'),
      });
    }
  }

  // Assets
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
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    designSystemVersion: dsVersion,
    components,
    tokens,
    stores,
    assets: { images, emptyStates },
  };
}

// ── Main ──────────────────────────────────────────────────────────────

const manifest = buildManifest();
const outputPath = join(dirname(new URL(import.meta.url).pathname), '..', 'dist', 'component-manifest.json');

// Also write to src/ so it can be committed and doesn't require build to exist
const srcOutputPath = join(dirname(new URL(import.meta.url).pathname), '..', 'component-manifest.json');

writeFileSync(srcOutputPath, JSON.stringify(manifest));

const componentCount = manifest.components.length;
const totalProps = manifest.components.reduce((sum, c) => sum + c.props.length, 0);
const totalSlots = manifest.components.reduce((sum, c) => sum + c.slots.length, 0);
const totalSubComponents = manifest.components.reduce((sum, c) => sum + c.subComponents.length, 0);
const fileSizeKb = (Buffer.byteLength(JSON.stringify(manifest)) / 1024).toFixed(1);

console.error(`Manifest generated: ${componentCount} components, ${totalProps} props, ${totalSlots} slots, ${totalSubComponents} sub-components`);
console.error(`File size: ${fileSizeKb} KB → ${srcOutputPath}`);
