// The circuit solver: modified nodal analysis (the recipe behind SPICE and Falstad's simulator) on a small dense
// matrix. Elements stamp conductances and currents; voltage sources and inductors add a branch current unknown;
// capacitors and inductors become companion models (backward Euler, stable for stiff switching nets); diodes
// are linearised and iterated (Newton–Raphson with a step clamp). Node 0 is ground.
//
// Headless and deterministic: the bench, the parts' macro models and the tests all run through solve()/step().

export type Node = number;
export const GROUND: Node = 0;

/** What an element adds to the system while it's being assembled. */
export interface Stamper {
    /** Conductance between node rows/columns (ground rows are dropped). */
    g(a: Node, b: Node, siemens: number): void;
    /** Current injected into a node (positive = into the node). */
    i(node: Node, amps: number): void;
    /** A branch current unknown: the row/column index for a voltage-source-like element. */
    branch(element: Element): number;
    /** v(a) - v(b) = volts, through branch k (the branch current flows a → b inside the source). */
    source(k: number, a: Node, b: Node, volts: number): void;
    /** v(a) - v(b) - ohms * i_k = volts: a branch with series resistance (inductor companions). */
    sourceR(k: number, a: Node, b: Node, ohms: number, volts: number): void;
    /** The node voltages of the previous Newton iteration (or the last solved step). */
    v(node: Node): number;
    /** The branch current of the previous iteration / step. */
    ik(k: number): number;
    readonly dt: number;   // 0 for a DC operating point
}

export interface Element {
    stamp(s: Stamper): void;
    /** Called once a step converged: capacitors and inductors remember their state. */
    commit?(s: Stamper): void;
    /** True while the element's linearisation still moves (diodes); the solver iterates until none does. */
    nonlinear?: boolean;
}

export class Resistor implements Element {
    constructor(public a: Node, public b: Node, public ohms: number) {}
    stamp(s: Stamper) { s.g(this.a, this.b, 1 / Math.max(this.ohms, 1e-9)); }
    current(v: number[]) { return (v[this.a] - v[this.b]) / Math.max(this.ohms, 1e-9); }
}

export class VoltageSource implements Element {
    k = -1;
    constructor(public a: Node, public b: Node, public volts: number) {}
    stamp(s: Stamper) { this.k = s.branch(this); s.source(this.k, this.a, this.b, this.volts); }
}

export class CurrentSource implements Element {
    constructor(public a: Node, public b: Node, public amps: number) {}
    stamp(s: Stamper) { s.i(this.a, -this.amps); s.i(this.b, this.amps); }
}

export class Capacitor implements Element {
    vPrev = 0;
    constructor(public a: Node, public b: Node, public farads: number) {}
    stamp(s: Stamper) {
        if (s.dt <= 0) { s.g(this.a, this.b, 1e-12); return; }   // DC: open
        const g = this.farads / s.dt;
        s.g(this.a, this.b, g);
        s.i(this.a, g * this.vPrev); s.i(this.b, -g * this.vPrev);
    }
    commit(s: Stamper) { this.vPrev = s.v(this.a) - s.v(this.b); }
}

export class Inductor implements Element {
    iPrev = 0;
    k = -1;
    constructor(public a: Node, public b: Node, public henries: number) {}
    stamp(s: Stamper) {
        this.k = s.branch(this);
        if (s.dt <= 0) { s.sourceR(this.k, this.a, this.b, 1e-6, 0); return; }   // DC: a short
        const r = this.henries / s.dt;
        s.sourceR(this.k, this.a, this.b, r, -r * this.iPrev);
    }
    commit(s: Stamper) { this.iPrev = s.ik(this.k); }
}

/** Shockley diode (anode a, cathode b): I = Is (e^(V / n Vt) - 1); the LED preset has a bigger n. */
export class Diode implements Element {
    nonlinear = true;
    constructor(public a: Node, public b: Node, public is = 1e-14, public n = 1, public vt = 0.02585) {}
    stamp(s: Stamper) {
        const nvt = this.n * this.vt;
        const v = Math.min(s.v(this.a) - s.v(this.b), nvt * 40);   // the exponential stays finite
        const e = Math.exp(v / nvt);
        const g = this.is * e / nvt + 1e-12, i = this.is * (e - 1);
        s.g(this.a, this.b, g);
        const ieq = i - g * v;
        s.i(this.a, -ieq); s.i(this.b, ieq);
    }
    current(v: number[]) { const vd = Math.min(v[this.a] - v[this.b], this.n * this.vt * 40); return this.is * (Math.exp(vd / (this.n * this.vt)) - 1); }
}

export class Switch implements Element {
    constructor(public a: Node, public b: Node, public closed: boolean, public onOhms = 1e-3, public offOhms = 1e9) {}
    stamp(s: Stamper) { s.g(this.a, this.b, 1 / (this.closed ? this.onOhms : this.offOhms)); }
}

export interface Solution {
    /** Node voltages, index = node (ground = 0). */
    v: number[];
    /** Branch currents by element (voltage sources, inductors): positive flows a → b through the element. */
    current(element: VoltageSource | Inductor): number;
    iterations: number;
    converged: boolean;
}

const GMIN = 1e-12;

/** Solves the net for one step of `dt` seconds (0 = DC operating point), iterating non-linear elements. */
export function step(elements: Element[], nodeCount: number, dt: number, previous?: Solution): Solution {
    let v = previous ? previous.v.slice() : new Array<number>(nodeCount).fill(0);
    let branches = new Map<Element, number>();
    let ik: number[] = [];
    const nonlinear = elements.some(e => e.nonlinear);
    let iterations = 0, converged = false;
    for (; iterations < 60; iterations++) {
        const n = nodeCount - 1;
        branches = new Map();
        const rows: number[][] = [];
        const rhs: number[] = [];
        const size = () => rows.length;
        const ensure = (count: number) => { while (rows.length < count) { for (const r of rows) r.push(0); rows.push(new Array<number>(rows.length + 1).fill(0)); rhs.push(0); } };
        ensure(n);
        const row = (node: Node) => node - 1;   // ground is dropped
        const ikPrev = ik;
        const stamper: Stamper = {
            dt,
            g(a, b, s) {
                if (a) rows[row(a)][row(a)] += s;
                if (b) rows[row(b)][row(b)] += s;
                if (a && b) { rows[row(a)][row(b)] -= s; rows[row(b)][row(a)] -= s; }
            },
            i(node, amps) { if (node) rhs[row(node)] += amps; },
            branch(element) { const k = size(); ensure(k + 1); branches.set(element, k); return k; },
            source(k, a, b, volts) { stamper.sourceR(k, a, b, 0, volts); },
            sourceR(k, a, b, ohms, volts) {
                if (a) { rows[row(a)][k] += 1; rows[k][row(a)] += 1; }
                if (b) { rows[row(b)][k] -= 1; rows[k][row(b)] -= 1; }
                rows[k][k] -= ohms;
                rhs[k] += volts;
            },
            v(node) { return node ? v[node] : 0; },
            ik(k) { return ikPrev[k] ?? 0; },
        };
        for (const e of elements) e.stamp(stamper);
        for (let i = 0; i < n; i++) rows[i][i] += GMIN;
        const x = solveLinear(rows, rhs);
        const next = [0, ...x.slice(0, n)];
        ik = x;   // branch currents sit at their absolute row index
        let delta = 0;
        for (let i = 1; i < nodeCount; i++) {
            // with diodes in the net, clamp the Newton step so it doesn't overshoot into the exponential's wall
            const d = nonlinear ? Math.max(-1, Math.min(1, next[i] - v[i])) : next[i] - v[i];
            delta = Math.max(delta, Math.abs(d));
            next[i] = v[i] + d;
        }
        v = next;
        if (!nonlinear || delta < 1e-7) { converged = true; iterations++; break; }
    }
    const solution: Solution = {
        v,
        current: (element) => ik[branches.get(element) ?? -1] ?? 0,
        iterations,
        converged,
    };
    const stamper = { v: (node: Node) => (node ? v[node] : 0), ik: (k: number) => ik[k] ?? 0 } as Stamper;
    for (const e of elements) e.commit?.(stamper);
    return solution;
}

/** Gaussian elimination with partial pivoting on a dense system. */
export function solveLinear(a: number[][], b: number[]): number[] {
    const n = b.length;
    const m = a.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
        if (Math.abs(m[p][c]) < 1e-18) { m[p][c] = 1e-18; }
        [m[c], m[p]] = [m[p], m[c]];
        for (let r = c + 1; r < n; r++) {
            const f = m[r][c] / m[c][c];
            if (f === 0) continue;
            for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
        }
    }
    const x = new Array<number>(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        let s = m[r][n];
        for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k];
        x[r] = s / m[r][r];
    }
    return x;
}

/** A growing net: hands out node numbers and collects elements. */
export class Netlist {
    elements: Element[] = [];
    private count = 1;   // ground exists
    node(): Node { return this.count++; }
    get nodeCount() { return this.count; }
    add<T extends Element>(e: T): T { this.elements.push(e); return e; }
    remove(e: Element) { this.elements = this.elements.filter(x => x !== e); }
    dc(): Solution { return step(this.elements, this.count, 0); }
    step(dt: number, previous?: Solution): Solution { return step(this.elements, this.count, dt, previous); }
}
