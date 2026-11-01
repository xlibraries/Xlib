// Types for src/index.mjs (the toolchain's core).
export const TOOLCHAIN_VERSION: string;
export const STAMP_FILE: string;

/** A module as a package declares it: its adapter, its providers, and whatever its adapter reads. */
export interface ModuleSpec { adapter: string; uses?: string[]; [option: string]: unknown }
export interface Manifest { root: string; name: string; version: string; json: Record<string, unknown>; modules: Record<string, ModuleSpec> }
export interface Provider { root: string; name: string; version: string; native: Record<string, unknown> }
export interface Context { root: string; pkg: Manifest; name: string; spec: ModuleSpec; providers: Provider[] }
export interface Input { label: string; path: string }
export interface Adapter {
    name: string;
    version: string;
    inputs(ctx: Context): Input[];
    fingerprint(ctx: Context): string[];
    build(ctx: Context, options?: { log?: (line: string) => void }): Promise<void>;
    outputs(ctx: Context): string[];
}

export function manifest(root: string): Manifest;
export function provider(fromRoot: string, name: string): Provider;
export function adapter(root: string, name: string): Promise<Adapter>;
export function context(pkg: Manifest, name: string): Context;
export function stamp(pkg: Manifest, name: string, adapter?: Adapter): Promise<{ hash: string; head: string[]; inputs: string[] }>;
export function check(root: string, name: string): Promise<{ current: boolean; expected: string; found: string | null }>;
export function build(options: { root: string; only?: string[]; force?: boolean; log?: (line: string) => void }): Promise<{ built: string[]; skipped: string[] }>;
