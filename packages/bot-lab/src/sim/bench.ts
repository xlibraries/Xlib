// The bench: a project turned into a circuit and run. Each tick (1/4800 s) the board runs its cycles, its pins
// become sources in the net, the net is solved, and what the circuit did comes back: input levels and analog
// voltages to the board, currents and voltages to the parts (an LED's brightness, a servo's command, a pin's
// load). Rules that teach come from the numbers: a pin over 40 mA, an LED over its rating, drivers fighting.
import { Capacitor, Diode, GROUND, Netlist, Resistor, Switch, VoltageSource, type Node, type Solution } from './circuit/mna';
import { Uno, UNO_CLOCK, type PinActivity } from './boards/uno';
import { CATALOG, LED_MODELS } from './parts/catalog';
import { nets, type PinRef, type Project } from './project';

export const TICK = 1 / 4800;           // the electrical step
const CYCLES_PER_TICK = Math.round(UNO_CLOCK * TICK);
const PIN_OUT_OHMS = 40;                 // an AVR pin's output stage
const PIN_MAX_AMPS = 0.04;
const PULLUP_OHMS = 35_000;
const LOGIC_HIGH = 3.0, LOGIC_LOW = 1.5;
const SERVO_MIN_US = 544, SERVO_MAX_US = 2400;

export interface Warning { part: string; text: string; smoke?: boolean }

/** What a part is doing, for the bench to draw. */
export interface PartState {
    /** LEDs: 0..1 */
    brightness?: number;
    /** Servos: degrees */
    angle?: number;
    /** Current through the part, amps (resistors, LEDs, batteries) */
    amps?: number;
    /** Volts across it */
    volts?: number;
    dead?: boolean;
}

interface PinDriver { pin: number; source: VoltageSource; pullup: Resistor | null; node: Node; activity?: PinActivity; mode: 'output' | 'input' | 'input_pullup' }

export class Bench {
    readonly net = new Netlist();
    readonly board: Uno | null;
    readonly nodeOf = new Map<string, Node>();   // "part.pin" → node
    readonly warnings: Warning[] = [];
    readonly states = new Map<string, PartState>();
    private solution: Solution | null = null;
    private drivers: PinDriver[] = [];
    private readonly leds: { part: string; diode: Diode; model: (typeof LED_MODELS)[string]; hot: number }[] = [];
    private readonly servos: { part: string; sigNode: Node; angle: number }[] = [];
    private readonly buttons: { part: string; sw: Switch }[] = [];
    private readonly sources: { part: string; source: VoltageSource; ohms: number }[] = [];
    private readonly resistors: { part: string; r: Resistor }[] = [];
    private readonly pots: { part: string; ra: Resistor; rb: Resistor }[] = [];
    private readonly ldrs: { part: string; r: Resistor }[] = [];
    private readonly dead = new Set<string>();
    time = 0;

    constructor(readonly project: Project) {
        // nets → nodes (any net with a ground pin is node 0)
        for (const group of nets(project)) {
            const grounded = group.some(k => { const [part, pin] = k.split('.'); return CATALOG[project.parts.find(p => p.id === part)!.kind].pins.find(p => p.id === pin)!.kind === 'ground'; });
            const node = grounded ? GROUND : this.net.node();
            for (const k of group) this.nodeOf.set(k, node);
        }
        this.board = project.parts.some(p => p.kind === 'uno') && project.code.hex ? new Uno(project.code.hex) : null;
        for (const part of project.parts) this.place(part.id, part.kind, part.props);
    }

    /** The node a pin sits on; unwired pins get their own floating node on demand. */
    node(ref: PinRef): Node {
        const k = `${ref.part}.${ref.pin}`;
        let node = this.nodeOf.get(k);
        if (node === undefined) {
            const spec = CATALOG[this.project.parts.find(p => p.id === ref.part)!.kind].pins.find(p => p.id === ref.pin)!;
            node = spec.kind === 'ground' ? GROUND : this.net.node();
            this.nodeOf.set(k, node);
        }
        return node;
    }

    private place(id: string, kind: string, props: Record<string, number | string | boolean>) {
        const n = (pin: string) => this.node({ part: id, pin });
        const num = (key: string) => Number(props[key]);
        switch (kind) {
            case 'uno': {
                this.net.add(new VoltageSource(n('5V'), GROUND, 5));
                this.net.add(new VoltageSource(n('3V3'), GROUND, 3.3));
                for (let pin = 0; pin < 20; pin++) {
                    const name = pin < 14 ? `D${pin}` : `A${pin - 14}`;
                    const node = n(name);
                    // every pin: a source behind the output stage; as an input, the source is switched to high-impedance
                    const source = this.net.add(new VoltageSource(this.net.node(), GROUND, 0));
                    const stage = this.net.add(new Resistor(source.a, node, PIN_OUT_OHMS));
                    const pullup = new Resistor(node, n('5V'), PULLUP_OHMS);
                    this.drivers.push({ pin, source, pullup, node, mode: 'input' });
                    stage.ohms = 1e9;   // starts as an input
                }
                break;
            }
            case 'battery': {
                const src = this.net.add(new VoltageSource(this.net.node(), n('-'), num('volts')));
                this.net.add(new Resistor(src.a, n('+'), Math.max(0.01, num('ohms'))));
                this.sources.push({ part: id, source: src, ohms: num('ohms') });
                break;
            }
            case 'resistor': this.resistors.push({ part: id, r: this.net.add(new Resistor(n('a'), n('b'), num('ohms'))) }); break;
            case 'capacitor': this.net.add(new Capacitor(n('a'), n('b'), num('farads'))); break;
            case 'led': {
                const model = LED_MODELS[String(props.colour)] ?? LED_MODELS.red;
                this.leds.push({ part: id, diode: this.net.add(new Diode(n('a'), n('k'), model.is, model.n)), model, hot: 0 });
                break;
            }
            case 'button': this.buttons.push({ part: id, sw: this.net.add(new Switch(n('a'), n('b'), props.pressed === true)) }); break;
            case 'potentiometer': {
                const ohms = num('ohms'), pos = Math.max(0.001, Math.min(0.999, num('position')));
                this.pots.push({ part: id, ra: this.net.add(new Resistor(n('a'), n('w'), ohms * pos)), rb: this.net.add(new Resistor(n('w'), n('b'), ohms * (1 - pos))) });
                break;
            }
            case 'ldr': this.ldrs.push({ part: id, r: this.net.add(new Resistor(n('a'), n('b'), ldrOhms(num('light')))) }); break;
            case 'servo': {
                this.net.add(new Resistor(n('sig'), GROUND, 1e6));           // the signal input
                this.net.add(new Resistor(n('v'), n('gnd'), 50));            // ~100 mA from 5 V
                this.servos.push({ part: id, sigNode: n('sig'), angle: 90 });
                break;
            }
        }
    }

    /** Changes a part's property live (a knob turned, a button pressed, a resistor retyped). */
    setProp(id: string, key: string, value: number | string | boolean) {
        const part = this.project.parts.find(p => p.id === id);
        if (!part) return;
        part.props[key] = value;
        const v = Number(value);
        for (const b of this.buttons) if (b.part === id && key === 'pressed') b.sw.closed = value === true;
        for (const r of this.resistors) if (r.part === id && key === 'ohms') r.r.ohms = v;
        for (const p of this.pots) if (p.part === id) { const ohms = Number(part.props.ohms), pos = Math.max(0.001, Math.min(0.999, Number(part.props.position))); p.ra.ohms = ohms * pos; p.rb.ohms = ohms * (1 - pos); }
        for (const l of this.ldrs) if (l.part === id && key === 'light') l.r.ohms = ldrOhms(v);
        for (const s of this.sources) if (s.part === id && key === 'volts') s.source.volts = v;
    }

    /** One electrical step: the board runs, the net settles, the parts react. */
    tick() {
        const dt = TICK;
        if (this.board) {
            this.board.run(CYCLES_PER_TICK);
            for (const d of this.drivers) {
                const a = this.board.pin(d.pin);
                d.activity = a;
                const stage = this.net.elements.find(e => e instanceof Resistor && e.a === d.source.a) as Resistor;
                if (a.mode === 'output') {
                    stage.ohms = PIN_OUT_OHMS;
                    d.source.volts = a.high ? 5 : 0;
                } else {
                    stage.ohms = 1e9;
                }
                if (a.mode === 'input_pullup' && d.mode !== 'input_pullup') this.net.add(d.pullup!);
                if (a.mode !== 'input_pullup' && d.mode === 'input_pullup') this.net.remove(d.pullup!);
                d.mode = a.mode;
            }
        }
        this.solution = this.net.step(dt, this.solution ?? undefined);
        const v = this.solution.v;
        this.time += dt;

        if (this.board) {
            for (const d of this.drivers) {
                if (d.mode === 'output') continue;
                const volts = v[d.node];
                if (d.pin >= 14) this.board.setAnalog(d.pin - 14, volts);
                if (volts > LOGIC_HIGH) this.board.setDigital(d.pin, true);
                else if (volts < LOGIC_LOW) this.board.setDigital(d.pin, false);
            }
        }
        // parts
        for (const led of this.leds) {
            const amps = led.diode.current(v);
            const state = this.states.get(led.part) ?? {};
            state.amps = amps;
            state.brightness = this.dead.has(led.part) ? 0 : Math.max(0, Math.min(1, amps / 0.02));
            if (amps > 0.05) led.hot += dt; else led.hot = Math.max(0, led.hot - dt);
            if (led.hot > 0.05 && !this.dead.has(led.part)) { this.dead.add(led.part); this.warn(led.part, `${led.part}: ${Math.round(amps * 1000)} mA through an LED rated 20 mA. It burnt out; add a resistor and replace it.`, true); }
            state.dead = this.dead.has(led.part);
            this.states.set(led.part, state);
        }
        for (const s of this.servos) {
            const driver = this.drivers.find(d => d.node === s.sigNode && d.mode === 'output' && d.activity);
            const pulse = driver?.activity?.pulseUs ?? 0;
            if (pulse >= 400 && pulse <= 2600) {
                const target = Math.max(0, Math.min(180, (pulse - SERVO_MIN_US) / (SERVO_MAX_US - SERVO_MIN_US) * 180));
                const rate = 600 * dt;   // degrees per tick: about 0.1 s per 60°
                s.angle += Math.max(-rate, Math.min(rate, target - s.angle));
            }
            this.states.set(s.part, { angle: s.angle });
        }
        for (const r of this.resistors) this.states.set(r.part, { amps: r.r.current(v), volts: v[r.r.a] - v[r.r.b] });
        for (const b of this.sources) this.states.set(b.part, { amps: -this.solution.current(b.source), volts: b.source.volts });
        // pins over their limit
        if (this.board) for (const d of this.drivers) {
            if (d.mode !== 'output') continue;
            const amps = Math.abs(this.solution.current(d.source));
            if (amps > PIN_MAX_AMPS) this.warn('uno', `Pin ${d.pin < 14 ? 'D' + d.pin : 'A' + (d.pin - 14)} is sourcing ${Math.round(amps * 1000)} mA; an Uno pin is rated 40 mA.`);
        }
    }

    /** Runs the bench for `seconds` of simulated time. */
    run(seconds: number) { for (let i = 0; i < Math.round(seconds / TICK); i++) this.tick(); }

    /** The voltage on a pin, volts. */
    volts(ref: PinRef): number { return this.solution ? this.solution.v[this.node(ref)] : 0; }
    state(id: string): PartState { return this.states.get(id) ?? {}; }

    private warn(part: string, text: string, smoke = false) {
        if (this.warnings.some(w => w.text === text)) return;
        this.warnings.push({ part, text, smoke });
        if (this.warnings.length > 20) this.warnings.shift();
    }
}

/** An LDR: 1 kΩ in full light, 100 kΩ in the dark (log-linear). */
export function ldrOhms(light: number) { return 1000 * Math.pow(100, 1 - Math.max(0, Math.min(1, light))); }
