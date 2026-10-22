export const ROOT: string;
export const STAMP: string;
export const MODULES: Record<string, { sources: string[]; headless?: boolean; physics?: boolean; exportName?: string; flags?: string[]; shaders?: string[] }>;
export function sourcesHash(): string;
