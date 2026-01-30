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
export interface DesignTokens {
    colors: ColorToken[];
    spacing: SpacingToken[];
    borderRadius: BorderRadiusToken[];
    maxWidth: MaxWidthToken[];
}
/**
 * Parse the colors.ts file to extract color tokens
 */
export declare function parseColors(assetsPath: string): ColorToken[];
/**
 * Parse the spacing.ts file to extract spacing tokens
 */
export declare function parseSpacing(assetsPath: string): SpacingToken[];
/**
 * Parse the border-radius.ts file to extract border radius tokens
 */
export declare function parseBorderRadius(assetsPath: string): BorderRadiusToken[];
/**
 * Parse the max-width.ts file to extract max width tokens
 */
export declare function parseMaxWidth(assetsPath: string): MaxWidthToken[];
/**
 * Get all design tokens
 */
export declare function getAllTokens(assetsPath: string): DesignTokens;
//# sourceMappingURL=token-parser.d.ts.map