export interface VueComponentTemplate {
    template: string;
    script: string;
    styles?: string;
}
/**
 * Parse a Vue SFC file to extract template, script, and styles
 */
export declare function parseVueFile(vueFilePath: string): VueComponentTemplate;
/**
 * Generate a basic usage example for a component
 */
export declare function generateUsageExample(componentName: string, props: Array<{
    name: string;
    type: string;
    default?: string;
    validValues?: string[];
}>): string;
//# sourceMappingURL=vue-parser.d.ts.map