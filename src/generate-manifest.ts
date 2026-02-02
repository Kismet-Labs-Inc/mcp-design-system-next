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
import { fileURLToPath } from 'url';

import { parseComponentProps, getComponentNameFromPath } from './parsers/props-parser.js';
import { parseSlots } from './parsers/slot-parser.js';
import { parseComposable } from './parsers/composable-parser.js';
import { parseTypes } from './parsers/type-parser.js';
import { getAllTokens } from './parsers/token-parser.js';
import type { PropDefinition, EmitDefinition, SlotDefinition, TypeDefinition, ComposableInfo, DesignTokens, SubComponentManifest, ComponentManifest, StoreManifest, Manifest } from './types.js';
import { getSubComponents, getComponentCategory, resolveSubComponentPath } from './utils.js';

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
        console.warn(`  Warning: failed to parse props for ${componentName}:`, (err as Error).message);
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
        const subTsPath = resolveSubComponentPath(componentDir, sub.name, 'ts');
        if (subTsPath) {
          try {
            const parsed = parseComponentProps(subTsPath);
            subProps = parsed.props;
            subEmits = parsed.emits;
          } catch (err) {
            console.error(`  Warning: failed to parse props for sub-component ${sub.name} in ${componentName}:`, (err as Error).message);
          }
        }
      }

      // Check for sub-component Vue file for slots
      const subVuePath = resolveSubComponentPath(componentDir, sub.name, 'vue');

      if (subVuePath) {
        try {
          subSlots = parseSlots(subVuePath);
        } catch (err) {
          console.error(`  Warning: failed to parse slots for sub-component ${sub.name} in ${componentName}:`, (err as Error).message);
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
// Write to project root so it can be committed and doesn't require build to exist
const srcOutputPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'component-manifest.json');

writeFileSync(srcOutputPath, JSON.stringify(manifest));

const componentCount = manifest.components.length;
const totalProps = manifest.components.reduce((sum, c) => sum + c.props.length, 0);
const totalSlots = manifest.components.reduce((sum, c) => sum + c.slots.length, 0);
const totalSubComponents = manifest.components.reduce((sum, c) => sum + c.subComponents.length, 0);
const fileSizeKb = (Buffer.byteLength(JSON.stringify(manifest)) / 1024).toFixed(1);

console.error(`Manifest generated: ${componentCount} components, ${totalProps} props, ${totalSlots} slots, ${totalSubComponents} sub-components`);
console.error(`File size: ${fileSizeKb} KB → ${srcOutputPath}`);
