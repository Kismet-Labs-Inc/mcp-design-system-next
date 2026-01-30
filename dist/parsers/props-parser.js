import { readFileSync } from 'fs';
import { basename } from 'path';
/**
 * Parse a component's TypeScript file to extract prop definitions
 */
export function parseComponentProps(tsFilePath) {
    const content = readFileSync(tsFilePath, 'utf-8');
    const props = [];
    const emits = [];
    // Extract const arrays (valid values for props)
    const constArrays = {};
    const constArrayRegex = /const\s+(\w+)\s*=\s*\[([^\]]+)\]\s*as\s+const/g;
    let constMatch;
    while ((constMatch = constArrayRegex.exec(content)) !== null) {
        const arrayName = constMatch[1];
        const values = constMatch[2]
            .split(',')
            .map(v => v.trim().replace(/['"]/g, ''))
            .filter(v => v);
        constArrays[arrayName] = values;
    }
    // Find the propTypes export
    const propTypesMatch = content.match(/export\s+const\s+(\w+PropTypes)\s*=\s*\{([\s\S]*?)\n\};/);
    if (propTypesMatch) {
        const propTypesBody = propTypesMatch[2];
        // Parse each prop definition
        // Match patterns like: propName: { type: ..., default: ..., validator: ... }
        // or simple: propName: { type: Boolean, default: false }
        const propRegex = /(?:\/\*\*[\s\S]*?@description\s+([^\n*]+)[\s\S]*?\*\/\s*)?(\w+):\s*\{([^}]+)\}/g;
        let propMatch;
        while ((propMatch = propRegex.exec(propTypesBody)) !== null) {
            const description = propMatch[1]?.trim();
            const propName = propMatch[2];
            const propBody = propMatch[3];
            const prop = {
                name: propName,
                type: 'unknown',
            };
            if (description) {
                prop.description = description;
            }
            // Extract type
            const typeMatch = propBody.match(/type:\s*(String|Boolean|Number|Array|Object|Function)/);
            if (typeMatch) {
                prop.type = typeMatch[1].toLowerCase();
            }
            // Check for PropType<...> pattern
            const propTypeMatch = propBody.match(/PropType<[^>]*typeof\s+(\w+)[^>]*>/);
            if (propTypeMatch) {
                const arrayName = propTypeMatch[1];
                if (constArrays[arrayName]) {
                    prop.validValues = constArrays[arrayName];
                    prop.type = 'string';
                }
            }
            // Extract default value
            const defaultMatch = propBody.match(/default:\s*(['"]?)([^'",\n]+)\1/);
            if (defaultMatch) {
                prop.default = defaultMatch[2].trim();
            }
            // Check for required
            const requiredMatch = propBody.match(/required:\s*(true|false)/);
            if (requiredMatch) {
                prop.required = requiredMatch[1] === 'true';
            }
            props.push(prop);
        }
    }
    // Find the emitTypes export
    const emitTypesMatch = content.match(/export\s+const\s+(\w+EmitTypes)\s*=\s*\{([\s\S]*?)\n\};/);
    if (emitTypesMatch) {
        const emitTypesBody = emitTypesMatch[2];
        // Parse each emit definition
        const emitRegex = /'?(\w+(?::\w+)?)'?:\s*\(([^)]*)\)/g;
        let emitMatch;
        while ((emitMatch = emitRegex.exec(emitTypesBody)) !== null) {
            const emitName = emitMatch[1].replace(/'/g, '');
            const params = emitMatch[2];
            emits.push({
                name: emitName,
                payloadType: params ? params.split(':')[1]?.trim() : undefined,
            });
        }
    }
    return { props, emits };
}
/**
 * Get the component name from the directory name
 */
export function getComponentNameFromPath(dirPath) {
    const dirName = basename(dirPath);
    // Convert kebab-case to PascalCase
    return dirName
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}
//# sourceMappingURL=props-parser.js.map