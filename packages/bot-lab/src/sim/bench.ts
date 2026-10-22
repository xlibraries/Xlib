// The bench: a project turned into a circuit and run. Each tick (1/4800 s) the board runs its cycles, its pins
// become sources in the net, the net is solved, and what the circuit did comes back: input levels and analog
// voltages to the board, currents and voltages to the parts (an LED's brightness, a servo's command, a pin's
// load). Rules that teach come from the numbers: a pin over 40 mA, an LED over its rating, drivers fighting.
import { Capacitor, Diode, GROUND, Netlist, Resistor, Switch, VoltageSource, type Node, type Solution } from './circuit/mna';
import { Uno, UNO_CLOCK, type PinActivity } from './boards/uno';
import { PI_GPIO, PI_LOGIC_VOLTS, PI_PIN_MAX_AMPS, PI_PIN_OUT_OHMS, PI_PULL_OHMS, PiBoard } from './boards/pi';
import { PICO_GPIO, PICO_LED, PICO_LOGIC_VOLTS, PICO_PIN_MAX_AMPS, PICO_PIN_OUT_OHMS, PICO_PULL_OHMS, Pico, type PicoFirmware } from './boards/pico';
import { CATALOG, LED_MODELS } from './parts/catalog';
import { Ads1115, I2CBus, Mpu6050, Tmp102, type I2CDevice } from './i2c';
import { nets, type PinRef, type Project } from './project';

export const TICK = 1 / 4800;           // the electrical step
const CYCLES_PER_TICK = Math.round(UNO_CLOCK * TICK);
const UNO_PIN_OUT_OHMS = 40;             // an AVR pin's output stage
const UNO_PIN_MAX_AMPS = 0.04;
const UNO_PULLUP_OHMS = 35_000;
const SERVO_MIN_US = 544, SERVO_MAX_US = 2400;
const PI_I2C_PULLUP_OHMS = 1800;         // the Pi's fixed pull-ups on GPIO2/GPIO3
const I2C_MIN_VOLTS = 1.8;               // below this a sensor is off

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
    /** Boards with an LED of their own (the Pico's GP25) */
    led?: boolean;
}

/** One board pin on the bench: a source behind an output stage, pull resistors, and how to talk to the board about it. */
interface PinDriver {
    board: 'uno' | 'pi' | 'pico';
    name: string;
    source: VoltageSource;
    stage: Resistor;
    pullup: Resistor;
    pulldown: Resistor;
    node: Node;
    activity?: PinActivity;
    mode: 'output' | 'input' | 'input_pullup';
    pulled: 'up' | 'down' | 'none';
    logicVolts: number;
    outOhms: number;
    maxAmps: number;
    read(): PinActivity;
    feed(high: boolean, volts: number): void;
}

export class Bench {
    readonly net = new Netlist();
    /** The Uno, when the project has one with a sketch */
    readonly board: Uno | null;
    /** The Raspberry Pi, when the project has one (its Python runtime drives it) */
    readonly pi: PiBoard | null;
    /** The Pico, when the project has one and its firmware was given */
    readonly pico: Pico | null;
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
    private picoPart: string | null = null;
    private readonly i2cDevices: { part: string; device: I2CDevice; sda: Node; scl: Node; vcc: Node; gnd: Node; supplied: boolean }[] = [];
    /** The Pi's I²C bus 1 (GPIO2 = SDA, GPIO3 = SCL), when there's a Pi */
    readonly piBus: I2CBus | null;
    /** The Uno's I²C (A4 = SDA, A5 = SCL), when there's an Uno */
    readonly unoBus: I2CBus | null;
    time = 0;

    /** `firmware.pico`: the Pico's boot ROM and MicroPython image (loaded by the caller: the worker fetches them) */
    constructor(readonly project: Project, firmware: { pico?: PicoFirmware } = {}) {
        // nets → nodes (any net with a ground pin is node 0)
        for (const group of nets(project)) {
            const grounded = group.some(k => { const [part, pin] = k.split('.'); return CATALOG[project.parts.find(p => p.id === part)!.kind].pins.find(p => p.id === pin)!.kind === 'ground'; });
            const node = grounded ? GROUND : this.net.node();
            for (const k of group) this.nodeOf.set(k, node);
        }
        this.board = project.parts.some(p => p.kind === 'uno') && project.code.board === 'uno' && project.code.hex ? new Uno(project.code.hex) : null;
        this.pi = project.parts.some(p => p.kind === 'pi') ? new PiBoard() : null;
        this.pico = project.parts.some(p => p.kind === 'pico') && firmware.pico ? new Pico(firmware.pico) : null;
        for (const part of project.parts) this.place(part.id, part.kind, part.props);
        const piPart = project.parts.find(p => p.kind === 'pi'), unoPart = project.parts.find(p => p.kind === 'uno');
        this.piBus = piPart ? this.bus(piPart.id, 'GPIO2', 'GPIO3') : null;
        this.unoBus = unoPart ? this.bus(unoPart.id, 'A4', 'A5') : null;
        this.board?.attachI2C(() => this.unoBus);
        const picoPart = project.parts.find(p => p.kind === 'pico');
        if (this.pico && picoPart) this.pico.attachI2C((sda, scl) => this.bus(picoPart.id, `GP${sda}`, `GP${scl}`));
    }

    /** A board's I²C bus: the powered, grounded devices whose SDA and SCL share its nets. Two on one address clash. */
    private bus(part: string, sdaPin: string, sclPin: string): I2CBus {
        const sda = this.node({ part, pin: sdaPin }), scl = this.node({ part, pin: sclPin });
        return new I2CBus(() => {
            if (!this.solution) this.tick();     // a script's first words can come before the first step: settle the circuit (power on)
            const v = this.solution?.v;
            const on = this.i2cDevices.filter(d => d.supplied && d.sda === sda && d.scl === scl && d.gnd === GROUND && !!v && v[d.vcc] >= I2C_MIN_VOLTS);
            const seen = new Map<number, string>();
            for (const d of on) {
                const other = seen.get(d.device.address);
                if (other) this.warn(d.part, `${other} and ${d.part} both answer at I²C address 0x${d.device.address.toString(16)}: change one\u2019s address.`);
                seen.set(d.device.address, d.part);
            }
            return on.filter((d, i) => on.findIndex(e => e.device.address === d.device.address) === i).map(d => d.device);
        });
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
                const board = this.board;
                for (let pin = 0; pin < 20; pin++) {
                    const name = pin < 14 ? `D${pin}` : `A${pin - 14}`;
                    this.driver('uno', name, n(name), n('5V'), 5, UNO_PIN_OUT_OHMS, UNO_PIN_MAX_AMPS, UNO_PULLUP_OHMS,
                        () => board ? board.pin(pin) : { mode: 'input', high: false, duty: 0, pulseUs: 0, periodUs: 0 },
                        (high, volts) => { if (!board) return; if (pin >= 14) board.setAnalog(pin - 14, volts); if (volts > 3.0) board.setDigital(pin, true); else if (volts < 1.5) board.setDigital(pin, false); });
                }
                break;
            }
            case 'pi': {
                this.net.add(new VoltageSource(n('5V'), GROUND, 5));
                this.net.add(new VoltageSource(n('3V3'), GROUND, PI_LOGIC_VOLTS));
                const pi = this.pi!;
                this.net.add(new Resistor(n('GPIO2'), n('3V3'), PI_I2C_PULLUP_OHMS));
                this.net.add(new Resistor(n('GPIO3'), n('3V3'), PI_I2C_PULLUP_OHMS));
                for (const bcm of PI_GPIO) {
                    const name = `GPIO${bcm}`;
                    this.driver('pi', name, n(name), n('3V3'), PI_LOGIC_VOLTS, PI_PIN_OUT_OHMS, PI_PIN_MAX_AMPS, PI_PULL_OHMS,
                        () => pi.activity(bcm), (high, volts) => { if (volts > 2.0) pi.setInput(bcm, true); else if (volts < 0.8) pi.setInput(bcm, false); else void high; });
                }
                break;
            }
            case 'pico': {
                this.net.add(new VoltageSource(n('VSYS'), GROUND, 5));
                this.net.add(new VoltageSource(n('3V3'), GROUND, PICO_LOGIC_VOLTS));
                const pico = this.pico;
                for (const gp of PICO_GPIO) {
                    const name = `GP${gp}`;
                    this.driver('pico', name, n(name), n('3V3'), PICO_LOGIC_VOLTS, PICO_PIN_OUT_OHMS, PICO_PIN_MAX_AMPS, PICO_PULL_OHMS,
                        () => pico ? pico.pin(gp) : { mode: 'input', high: false, duty: 0, pulseUs: 0, periodUs: 0 },
                        (_high, volts) => {
                            if (!pico) return;
                            if (gp >= 26) pico.setAdc(gp - 26, volts);
                            if (volts > 2.0) pico.setInput(gp, true); else if (volts < 0.8) pico.setInput(gp, false);
                        });
                }
                this.picoPart = id;
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
            case 'tmp102': case 'ads1115': case 'mpu6050': {
                const part = this.project.parts.find(p => p.id === id)!;
                const prop = (key: string) => Number(part.props[key]);
                const address = parseInt(String(props.address), 16);
                const vcc = n(kind === 'ads1115' ? 'VDD' : 'VCC'), gnd = n('GND');
                this.net.add(new Resistor(vcc, gnd, 33_000));     // ~100 µA from 3.3 V
                this.net.add(new Resistor(n('SDA'), vcc, 10_000)); // breakout boards carry I²C pull-ups
                this.net.add(new Resistor(n('SCL'), vcc, 10_000));
                let device: I2CDevice;
                if (kind === 'tmp102') device = new Tmp102(address, () => prop('temperature'));
                else if (kind === 'mpu6050') device = new Mpu6050(address, () => ({ pitch: prop('pitch'), roll: prop('roll'), gx: 0, gy: 0, gz: prop('turn'), celsius: prop('temperature') }));
                else {
                    const inputs = ['A0', 'A1', 'A2', 'A3'].map(pin => { const node = n(pin); this.net.add(new Resistor(node, gnd, 10e6)); return node; });
                    device = new Ads1115(address, ch => { const v = this.solution?.v; return v ? v[inputs[ch]] - v[gnd] : 0; });
                }
                // its VCC must reach a supply (a board's 3.3 V/5 V, a battery): its own pull-ups on SDA/SCL would
                // otherwise back-feed it from the bus, and an unwired sensor should simply be off
                const vccPin = kind === 'ads1115' ? 'VDD' : 'VCC';
                const net = nets(this.project).find(g => g.includes(`${id}.${vccPin}`)) ?? [];
                const supplied = net.some(k => { const [pid, pin] = k.split('.'); const other = this.project.parts.find(p => p.id === pid); return pid !== id && !!other && CATALOG[other.kind].pins.find(p => p.id === pin)?.kind === 'power' && (other.kind === 'battery' || CATALOG[other.kind].group === 'board'); });
                this.i2cDevices.push({ part: id, device, sda: n('SDA'), scl: n('SCL'), vcc, gnd, supplied });
                break;
            }
            case 'servo': {
                this.net.add(new Resistor(n('sig'), GROUND, 1e6));           // the signal input
                this.net.add(new Resistor(n('v'), n('gnd'), 50));            // ~100 mA from 5 V
                this.servos.push({ part: id, sigNode: n('sig'), angle: 90 });
                break;
            }
        }
    }

    /** A board pin: a source behind an output stage (high impedance while an input), with pull resistors held aside. */
    private driver(board: 'uno' | 'pi' | 'pico', name: string, node: Node, rail: Node, logicVolts: number, outOhms: number, maxAmps: number, pullOhms: number, read: () => PinActivity, feed: (high: boolean, volts: number) => void) {
        const source = this.net.add(new VoltageSource(this.net.node(), GROUND, 0));
        const stage = this.net.add(new Resistor(source.a, node, 1e9));
        this.drivers.push({ board, name, source, stage, pullup: new Resistor(node, rail, pullOhms), pulldown: new Resistor(node, GROUND, pullOhms), node, mode: 'input', pulled: 'none', logicVolts, outOhms, maxAmps, read, feed });
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
        this.board?.run(CYCLES_PER_TICK);
        this.pi?.run(dt);
        this.pico?.run(dt);
        for (const d of this.drivers) {
            const a = d.read();
            d.activity = a;
            if (a.mode === 'output') { d.stage.ohms = d.outOhms; d.source.volts = a.high ? d.logicVolts : 0; }
            else d.stage.ohms = 1e9;
            // pull resistors come and go with the pin's configuration
            const pulled = a.mode === 'input_pullup' ? 'up'
                : a.mode === 'input' && d.board === 'pi' && this.pi?.pull(Number(d.name.slice(4))) === 'down' ? 'down'
                    : a.mode === 'input' && d.board === 'pico' && this.pico?.pull(Number(d.name.slice(2))) === 'down' ? 'down' : 'none';
            if (pulled !== d.pulled) {
                if (d.pulled === 'up') this.net.remove(d.pullup); else if (d.pulled === 'down') this.net.remove(d.pulldown);
                if (pulled === 'up') this.net.add(d.pullup); else if (pulled === 'down') this.net.add(d.pulldown);
                d.pulled = pulled;
            }
            d.mode = a.mode;
        }
        this.solution = this.net.step(dt, this.solution ?? undefined);
        const v = this.solution.v;
        this.time += dt;

        for (const d of this.drivers) if (d.mode !== 'output') d.feed(v[d.node] > d.logicVolts * 0.6, v[d.node]);
        // parts
        for (const led of this.leds) {
            const amps = led.diode.current(v);
            const state = this.states.get(led.part) ?? {};
            state.amps = amps;
            state.brightness = this.dead.has(led.part) ? 0 : ledBrightness(amps);
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
        if (this.pico && this.picoPart) this.states.set(this.picoPart, { led: this.pico.pin(PICO_LED).duty > 0.5 });
        for (const b of this.sources) this.states.set(b.part, { amps: -this.solution.current(b.source), volts: b.source.volts });
        // pins over their limit
        for (const d of this.drivers) {
            if (d.mode !== 'output') continue;
            const amps = Math.abs(this.solution.current(d.source));
            if (amps > d.maxAmps) this.warn(d.board, `Pin ${d.name} is sourcing ${Math.round(amps * 1000)} mA; a${d.board === 'uno' ? 'n Uno' : d.board === 'pi' ? ' Pi' : ' Pico'} pin is rated ${Math.round(d.maxAmps * 1000)} mA.`);
        }
    }

    private pending = 0;
    /** Runs the bench for `seconds` of simulated time; slivers shorter than a tick carry over, so time always advances. */
    run(seconds: number) {
        this.pending += Math.max(0, seconds);
        while (this.pending >= TICK - 1e-12) { this.tick(); this.pending -= TICK; }
    }

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

/** How bright an LED looks at `amps`, 0–1 (1 at its rated 20 mA). Eyes respond roughly to the square root of light
 *  output, so 5 mA from a 3.3 V pin through 220 Ω reads as clearly lit (about half), as it does on a real bench. */
export function ledBrightness(amps: number): number {
    return Math.sqrt(Math.max(0, Math.min(1, amps / 0.02)));
}
