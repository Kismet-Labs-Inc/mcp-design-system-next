import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ColorToken {
  name: string;
  shades: Record<number, string>;
}

export interface SpacingToken {
  name: string;
  value: string;
}

export interface BorderRadiusToken {
  name: string;
  value: string;
}

export interface MaxWidthToken {
  name: string;
  value: string;
}

export interface UtilityToken {
  name: string;
  properties: Record<string, string>;
}

export interface DesignTokens {
  colors: ColorToken[];
  spacing: SpacingToken[];
  borderRadius: BorderRadiusToken[];
  maxWidth: MaxWidthToken[];
  utilities: UtilityToken[];
}

/**
 * Parse the colors.ts file to extract color tokens
 */
export function parseColors(assetsPath: string): ColorToken[] {
  const colorsPath = join(assetsPath, 'scripts', 'colors.ts');
  if (!existsSync(colorsPath)) {
    return [];
  }

  const content = readFileSync(colorsPath, 'utf-8');
  const colors: ColorToken[] = [];

  // Find the colorScheme object
  const colorSchemeMatch = content.match(/const\s+colorScheme[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!colorSchemeMatch) {
    return colors;
  }

  const colorSchemeBody = colorSchemeMatch[1];

  // Parse each color family
  const colorFamilyRegex = /(\w+):\s*\{([^}]+)\}/g;
  let familyMatch;

  while ((familyMatch = colorFamilyRegex.exec(colorSchemeBody)) !== null) {
    const colorName = familyMatch[1];
    const shadesBody = familyMatch[2];

    const shades: Record<number, string> = {};
    const shadeRegex = /(\d+):\s*'(#[A-Fa-f0-9]+)'/g;
    let shadeMatch;

    while ((shadeMatch = shadeRegex.exec(shadesBody)) !== null) {
      shades[parseInt(shadeMatch[1])] = shadeMatch[2];
    }

    colors.push({ name: colorName, shades });
  }

  return colors;
}

/**
 * Parse the spacing.ts file to extract spacing tokens
 */
export function parseSpacing(assetsPath: string): SpacingToken[] {
  const spacingPath = join(assetsPath, 'scripts', 'spacing.ts');
  if (!existsSync(spacingPath)) {
    return [];
  }

  const content = readFileSync(spacingPath, 'utf-8');
  const tokens: SpacingToken[] = [];

  // Find the spacing object
  const spacingMatch = content.match(/const\s+spacing[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!spacingMatch) {
    return tokens;
  }

  const spacingBody = spacingMatch[1];

  // Parse each spacing token
  const tokenRegex = /'([^']+)':\s*'([^']+)'/g;
  let tokenMatch;

  while ((tokenMatch = tokenRegex.exec(spacingBody)) !== null) {
    tokens.push({
      name: tokenMatch[1],
      value: tokenMatch[2],
    });
  }

  return tokens;
}

/**
 * Parse the border-radius.ts file to extract border radius tokens
 */
export function parseBorderRadius(assetsPath: string): BorderRadiusToken[] {
  const radiusPath = join(assetsPath, 'scripts', 'border-radius.ts');
  if (!existsSync(radiusPath)) {
    return [];
  }

  const content = readFileSync(radiusPath, 'utf-8');
  const tokens: BorderRadiusToken[] = [];

  // Find the borderRadius object
  const radiusMatch = content.match(/const\s+borderRadius[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!radiusMatch) {
    return tokens;
  }

  const radiusBody = radiusMatch[1];

  // Parse each token
  const tokenRegex = /'([^']+)':\s*'([^']+)'/g;
  let tokenMatch;

  while ((tokenMatch = tokenRegex.exec(radiusBody)) !== null) {
    tokens.push({
      name: tokenMatch[1],
      value: tokenMatch[2],
    });
  }

  return tokens;
}

/**
 * Parse the max-width.ts file to extract max width tokens
 */
export function parseMaxWidth(assetsPath: string): MaxWidthToken[] {
  const maxWidthPath = join(assetsPath, 'scripts', 'max-width.ts');
  if (!existsSync(maxWidthPath)) {
    return [];
  }

  const content = readFileSync(maxWidthPath, 'utf-8');
  const tokens: MaxWidthToken[] = [];

  // Find the maxWidth object
  const maxWidthMatch = content.match(/const\s+maxWidth[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!maxWidthMatch) {
    return tokens;
  }

  const maxWidthBody = maxWidthMatch[1];

  // Parse each token
  const tokenRegex = /(\w+):\s*'([^']+)'/g;
  let tokenMatch;

  while ((tokenMatch = tokenRegex.exec(maxWidthBody)) !== null) {
    tokens.push({
      name: tokenMatch[1],
      value: tokenMatch[2],
    });
  }

  return tokens;
}

/**
 * Parse the utilities.ts file to extract utility tokens
 */
export function parseUtilities(assetsPath: string): UtilityToken[] {
  const utilitiesPath = join(assetsPath, 'scripts', 'utilities.ts');
  if (!existsSync(utilitiesPath)) {
    return [];
  }

  const content = readFileSync(utilitiesPath, 'utf-8');
  const tokens: UtilityToken[] = [];

  // Match each utility entry: 'name': { prop: 'value', ... }
  const utilityRegex = /'([^']+)':\s*\{([^}]+)\}/g;
  let match;

  while ((match = utilityRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const properties: Record<string, string> = {};

    const propRegex = /(\w+):\s*'([^']+)'/g;
    let propMatch;
    while ((propMatch = propRegex.exec(body)) !== null) {
      properties[propMatch[1]] = propMatch[2];
    }

    tokens.push({ name, properties });
  }

  return tokens;
}

/**
 * Get all design tokens
 */
export function getAllTokens(assetsPath: string): DesignTokens {
  return {
    colors: parseColors(assetsPath),
    spacing: parseSpacing(assetsPath),
    borderRadius: parseBorderRadius(assetsPath),
    maxWidth: parseMaxWidth(assetsPath),
    utilities: parseUtilities(assetsPath),
  };
}
