import { basename } from 'path';
import {
  Project,
  SyntaxKind,
  type SourceFile,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  Node,
} from 'ts-morph';

export interface PropDefinition {
  name: string;
  type: string;
  default?: string;
  description?: string;
  validValues?: string[];
  required?: boolean;
  validator?: string;
}

export interface EmitDefinition {
  name: string;
  payloadType?: string;
}

export interface ComponentProps {
  props: PropDefinition[];
  emits: EmitDefinition[];
}

// Shared project instance, lazily initialized
let sharedProject: Project | null = null;

export function getSharedProject(): Project {
  if (!sharedProject) {
    sharedProject = new Project({
      compilerOptions: {
        allowJs: true,
        skipLibCheck: true,
      },
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
    });
  }
  return sharedProject;
}

function resolveType(propBody: ObjectLiteralExpression): string {
  const typeProp = propBody.getProperty('type');
  if (!typeProp || !Node.isPropertyAssignment(typeProp)) return 'unknown';

  const initializer = typeProp.getInitializer();
  if (!initializer) return 'unknown';

  const text = initializer.getText();

  // Handle "Boolean as PropType<boolean>" → "boolean"
  const castMatch = text.match(/PropType<([^>]+)>/);
  if (castMatch) return castMatch[1];

  // Handle simple types: String, Boolean, Number, Array, Object, Function
  const simpleTypes: Record<string, string> = {
    String: 'string',
    Boolean: 'boolean',
    Number: 'number',
    Array: 'Array',
    Object: 'Object',
    Function: 'Function',
  };

  if (simpleTypes[text]) return simpleTypes[text];
  return text;
}

function resolveDefault(propBody: ObjectLiteralExpression): string | undefined {
  const defaultProp = propBody.getProperty('default');
  if (!defaultProp || !Node.isPropertyAssignment(defaultProp)) return undefined;

  const initializer = defaultProp.getInitializer();
  if (!initializer) return undefined;

  return initializer.getText();
}

function resolveValidator(propBody: ObjectLiteralExpression): string | undefined {
  const validatorProp = propBody.getProperty('validator');
  if (!validatorProp || !Node.isPropertyAssignment(validatorProp)) return undefined;

  const initializer = validatorProp.getInitializer();
  if (!initializer) return undefined;

  return initializer.getText();
}

function resolveRequired(propBody: ObjectLiteralExpression): boolean | undefined {
  const reqProp = propBody.getProperty('required');
  if (!reqProp || !Node.isPropertyAssignment(reqProp)) return undefined;

  const initializer = reqProp.getInitializer();
  if (!initializer) return undefined;

  return initializer.getText() === 'true' ? true : false;
}

function getJsDocDescription(node: Node): string | undefined {
  // Walk up to get the JSDoc from the parent property assignment
  const jsDocs = node.getLeadingCommentRanges();
  for (const doc of jsDocs) {
    const text = doc.getText();
    const descMatch = text.match(/@description\s+([^\n*]+)/);
    if (descMatch) return descMatch[1].trim().replace(/,\s*$/, '');
  }
  return undefined;
}

function extractConstArrays(sourceFile: SourceFile): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  sourceFile.getVariableDeclarations().forEach(decl => {
    const initializer = decl.getInitializer();
    if (!initializer) return;

    const text = initializer.getText();
    // Match [...] as const
    if (initializer.getKind() === SyntaxKind.AsExpression) {
      const inner = initializer.getChildAtIndex(0);
      if (inner && inner.getKind() === SyntaxKind.ArrayLiteralExpression) {
        const values: string[] = [];
        inner.forEachChild(child => {
          if (child.getKind() === SyntaxKind.StringLiteral) {
            values.push(child.getText().replace(/['"]/g, ''));
          }
        });
        if (values.length > 0) {
          result[decl.getName()] = values;
        }
      }
    }
  });

  return result;
}

export function parseComponentProps(tsFilePath: string): ComponentProps {
  const project = getSharedProject();
  let sourceFile = project.getSourceFile(tsFilePath);
  if (!sourceFile) {
    sourceFile = project.addSourceFileAtPath(tsFilePath);
  }

  const props: PropDefinition[] = [];
  const emits: EmitDefinition[] = [];
  const constArrays = extractConstArrays(sourceFile);

  // Find *PropTypes variable declaration
  sourceFile.getVariableDeclarations().forEach(decl => {
    const name = decl.getName();
    if (!name.endsWith('PropTypes')) return;

    const initializer = decl.getInitializer();
    if (!initializer || initializer.getKind() !== SyntaxKind.ObjectLiteralExpression) return;

    const obj = initializer as ObjectLiteralExpression;
    obj.getProperties().forEach(prop => {
      if (!Node.isPropertyAssignment(prop)) return;

      const propName = prop.getName();
      const propInit = prop.getInitializer();

      if (!propInit || propInit.getKind() !== SyntaxKind.ObjectLiteralExpression) return;

      const propBody = propInit as ObjectLiteralExpression;

      const propDef: PropDefinition = {
        name: propName,
        type: resolveType(propBody),
      };

      const description = getJsDocDescription(prop);
      if (description) propDef.description = description;

      const defaultVal = resolveDefault(propBody);
      if (defaultVal !== undefined) propDef.default = defaultVal;

      const required = resolveRequired(propBody);
      if (required !== undefined) propDef.required = required;

      const validator = resolveValidator(propBody);
      if (validator) propDef.validator = validator;

      // Check for valid values from const arrays via PropType<typeof X[number]>
      const typeText = propBody.getProperty('type')
        ? (propBody.getProperty('type') as PropertyAssignment)?.getInitializer()?.getText() ?? ''
        : '';
      const typeofMatch = typeText.match(/typeof\s+(\w+)/);
      if (typeofMatch && constArrays[typeofMatch[1]]) {
        propDef.validValues = constArrays[typeofMatch[1]];
        if (propDef.type.includes('typeof')) {
          propDef.type = 'string';
        }
      }

      // Also check validator text for const array references
      if (validator) {
        const valArrayMatch = validator.match(/(\w+)\.includes/);
        if (valArrayMatch && constArrays[valArrayMatch[1]]) {
          propDef.validValues = constArrays[valArrayMatch[1]];
        }
      }

      props.push(propDef);
    });
  });

  // Find *EmitTypes variable declaration
  sourceFile.getVariableDeclarations().forEach(decl => {
    const name = decl.getName();
    if (!name.endsWith('EmitTypes') && !name.endsWith('emitTypes')) return;

    const initializer = decl.getInitializer();
    if (!initializer || initializer.getKind() !== SyntaxKind.ObjectLiteralExpression) return;

    const obj = initializer as ObjectLiteralExpression;
    obj.getProperties().forEach(prop => {
      if (!Node.isPropertyAssignment(prop)) return;

      const emitName = prop.getName().replace(/['"]/g, '');
      const emitInit = prop.getInitializer();

      let payloadType: string | undefined;
      if (emitInit) {
        const emitText = emitInit.getText();
        // Try to extract parameter type from (value: Type) => ...
        const paramMatch = emitText.match(/\(\s*\w+\s*:\s*([^),]+)/);
        if (paramMatch) {
          payloadType = paramMatch[1].trim();
        }
      }

      emits.push({ name: emitName, payloadType });
    });
  });

  return { props, emits };
}

/**
 * Get the component name from the directory name
 */
export function getComponentNameFromPath(dirPath: string): string {
  const dirName = basename(dirPath);
  return dirName
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
