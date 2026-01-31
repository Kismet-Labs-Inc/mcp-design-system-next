import { SyntaxKind, Node } from 'ts-morph';
import { getSharedProject } from './props-parser.js';

export interface TypeDefinition {
  name: string;
  kind: 'type' | 'interface' | 'const-array';
  definition: string;
}

export function parseTypes(tsFilePath: string): TypeDefinition[] {
  const project = getSharedProject();
  let sourceFile = project.getSourceFile(tsFilePath);
  if (!sourceFile) {
    sourceFile = project.addSourceFileAtPath(tsFilePath);
  }

  const types: TypeDefinition[] = [];

  // Exported type aliases
  sourceFile.getTypeAliases().forEach(alias => {
    if (alias.isExported()) {
      types.push({
        name: alias.getName(),
        kind: 'type',
        definition: alias.getText(),
      });
    }
  });

  // Exported interfaces
  sourceFile.getInterfaces().forEach(iface => {
    if (iface.isExported()) {
      types.push({
        name: iface.getName(),
        kind: 'interface',
        definition: iface.getText(),
      });
    }
  });

  // Exported const assertions (const X = [...] as const)
  sourceFile.getVariableDeclarations().forEach(decl => {
    const statement = decl.getVariableStatement();
    if (!statement || !statement.isExported()) return;

    const initializer = decl.getInitializer();
    if (!initializer) return;

    if (initializer.getKind() === SyntaxKind.AsExpression) {
      const asExpr = initializer;
      const typeNode = asExpr.getLastChild();
      if (typeNode && typeNode.getText() === 'const') {
        types.push({
          name: decl.getName(),
          kind: 'const-array',
          definition: `const ${decl.getName()} = ${initializer.getText()}`,
        });
      }
    }
  });

  return types;
}
