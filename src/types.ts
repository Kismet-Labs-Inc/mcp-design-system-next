/**
 * Shared type definitions for the MCP server and manifest generator.
 */

// Re-export primitive types from parsers
export type { PropDefinition, EmitDefinition } from './parsers/props-parser.js';
export type { SlotDefinition } from './parsers/slot-parser.js';
export type { ComposableInfo } from './parsers/composable-parser.js';
export type { TypeDefinition } from './parsers/type-parser.js';
export type { DesignTokens } from './parsers/token-parser.js';

import type { PropDefinition, EmitDefinition } from './parsers/props-parser.js';
import type { SlotDefinition } from './parsers/slot-parser.js';
import type { ComposableInfo } from './parsers/composable-parser.js';
import type { TypeDefinition } from './parsers/type-parser.js';
import type { DesignTokens } from './parsers/token-parser.js';

// ── Composite manifest types ──────────────────────────────────────────

export interface SubComponentManifest {
  name: string;
  pascalName: string;
  props: PropDefinition[];
  emits: EmitDefinition[];
  slots: SlotDefinition[];
}

export interface ComponentManifest {
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

export interface StoreManifest {
  name: string;
  fileName: string;
  source: string;
}

export interface Manifest {
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
