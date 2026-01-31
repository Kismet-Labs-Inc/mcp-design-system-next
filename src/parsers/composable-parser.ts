import { readFileSync } from 'fs';
import { basename } from 'path';

export interface ComposableInfo {
  name: string;
  fileName: string;
  signature: string;
  returnedMembers: string[];
}

export function parseComposable(filePath: string): ComposableInfo {
  const content = readFileSync(filePath, 'utf-8');
  const fileName = basename(filePath);

  // Find the exported function matching use*
  // Patterns: export const useX = (params) => { ... } or export function useX(params) { ... }
  const arrowMatch = content.match(
    /export\s+const\s+(use\w+)\s*=\s*\(([^)]*)\)[^=]*=>\s*\{/
  );
  const funcMatch = content.match(
    /export\s+function\s+(use\w+)\s*\(([^)]*)\)/
  );

  const match = arrowMatch || funcMatch;
  const name = match ? match[1] : fileName.replace('.ts', '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const params = match ? match[2].trim() : '';

  // Build signature from params
  // Simplify by extracting parameter names and types
  const paramParts = params
    .split(',')
    .map(p => p.trim())
    .filter(p => p);

  const signature = paramParts.length > 0
    ? `(${paramParts.map(p => {
        // Extract name: type pattern
        const colonIdx = p.indexOf(':');
        if (colonIdx > -1) {
          return p.substring(0, colonIdx).trim() + ': ' + p.substring(colonIdx + 1).trim();
        }
        return p;
      }).join(', ')})`
    : '()';

  // Find the last return { ... } block and extract property names
  const returnedMembers: string[] = [];
  const returnBlocks = [...content.matchAll(/return\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)];
  if (returnBlocks.length > 0) {
    const lastReturn = returnBlocks[returnBlocks.length - 1][1];
    // Extract property names from the return object
    const memberRegex = /(\w+)(?:\s*[:,]|\s*$)/g;
    let memberMatch;
    while ((memberMatch = memberRegex.exec(lastReturn)) !== null) {
      const member = memberMatch[1];
      // Skip common keywords that appear in return blocks
      if (!['return', 'const', 'let', 'var', 'if', 'else', 'value'].includes(member)) {
        returnedMembers.push(member);
      }
    }
  }

  return { name, fileName, signature, returnedMembers };
}
