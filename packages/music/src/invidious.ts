// Invidious is an open-source YouTube front-end with a public JSON API (no key, no signup). Public
// instances come and go, so the client tries each known one in turn, moves the one that answers to the
// front, and discovers more from the public directory when all of them fail.

export interface InvidiousOptions {
    instances?: string[];
    directory?: string;
    timeoutMs?: number;
    fetch?: typeof fetch;
}

interface DirectoryEntry { type: string; api: boolean | null; cors: boolean | null; uri: string }

export class Invidious {
    private instances: string[];
    private discovered = false;
    private readonly directory: string;
    private readonly timeoutMs: number;
    private readonly fetchImpl: typeof fetch;

    constructor(options: InvidiousOptions = {}) {
        this.instances = [...(options.instances ?? ['https://invidious.f5.si'])];
        this.directory = options.directory ?? 'https://api.invidious.io/instances.json?sort_by=health';
        this.timeoutMs = options.timeoutMs ?? 10000;
        this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    }

    get known(): readonly string[] {
        return this.instances;
    }

    /** Adds healthy https instances that allow browser (CORS) requests. Runs once. */
    private async discover(): Promise<void> {
        if (this.discovered) return;
        this.discovered = true;
        try {
            const list: [string, DirectoryEntry][] = await (await this.fetchImpl(this.directory)).json();
            for (const [, info] of list) {
                if (info.type === 'https' && info.api && info.cors && !this.instances.includes(info.uri)) this.instances.push(info.uri);
            }
        } catch { /* keep what we have */ }
    }

    /** GET /api/v1{path} from the first instance that answers. */
    async get<T>(path: string, start = 0): Promise<T> {
        for (let i = start; ; i++) {
            if (i >= this.instances.length) {
                const before = this.instances.length;
                await this.discover();
                if (this.instances.length === before) throw new Error('No Invidious instance available');
            }
            const base = this.instances[i];
            try {
                const res = await this.fetchImpl(base + '/api/v1' + path, { signal: AbortSignal.timeout(this.timeoutMs) });
                if (!res.ok) throw new Error(String(res.status));
                const data = (await res.json()) as T;
                if (i > 0) this.instances = [base, ...this.instances.filter((x) => x !== base)];
                return data;
            } catch { /* try the next instance */ }
        }
    }
}
