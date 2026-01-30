export interface PropDefinition {
    name: string;
    type: string;
    default?: string;
    description?: string;
    validValues?: string[];
    required?: boolean;
}
export interface EmitDefinition {
    name: string;
    payloadType?: string;
}
export interface ComponentProps {
    props: PropDefinition[];
    emits: EmitDefinition[];
}
/**
 * Parse a component's TypeScript file to extract prop definitions
 */
export declare function parseComponentProps(tsFilePath: string): ComponentProps;
/**
 * Get the component name from the directory name
 */
export declare function getComponentNameFromPath(dirPath: string): string;
//# sourceMappingURL=props-parser.d.ts.map