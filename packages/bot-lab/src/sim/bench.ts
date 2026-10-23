// The bench: a project turned into a circuit and run. Each tick (1/4800 s) the board runs its cycles, its pins
// become sources in the net, the net is solved, and what the circuit did comes back: input levels and analog
// voltages to the board, currents and voltages to the parts (an LED's brightness, a servo's command, a pin's
// load). Rules that teach come from the numbers: a pin over 40 mA, an LED over its rating, drivers fighting.
import { Capacitor, CurrentSource, Diode, GROUND, Netlist, Resistor, Switch, VoltageSource, type Node, type Solution } from './circuit/mna';
import { Uno, UNO_CLOCK, type PinActivity } from './boards/uno';
import { PI_GPIO, PI_LOGIC_VOLTS, PI_PIN_MAX_AMPS, PI_PIN_OUT_OHMS, PI_PULL_OHMS, PiBoard } from './boards/pi';
import { PICO_GPIO, PICO_LED, PICO_LOGIC_VOLTS, PICO_PIN_MAX_AMPS, PICO_PIN_OUT_OHMS, PICO_PULL_OHMS, Pico, type PicoFirmware } from './boards/pico';
import { CATALOG, LED_MODELS, SERVO_MODELS } from './parts/catalog';
import { Ads1115, I2CBus, Mpu6050, Tmp102, type I2CDevice, type Motion } from './i2c';
import { LcdBackpack, Ssd1306, type ScreenState } from './displays';
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
    /** Boards with an LED of their own (the Pico's GP25), and sensors with an indicator LED */
    led?: boolean;
    /** Motors: shaft speed and angle */
    rpm?: number;
    /** Brushless motors: thrust (N) and whether the ESC is armed */
    thrust?: number;
    armed?: boolean;
    turned?: number;
    /** 7-segment digits: each segment's brightness, a–g then the dot */
    segments?: number[];
    /** Screens: what they show */
    screen?: ScreenState;
}

/** The brushless motor, ESC and prop: 2300 kV on a 5" prop, sized so full throttle on 11.1 V gives about 5 N */
export const QUAD_MOTOR = { kv: 2300, efficiency: 0.85, nominalVolts: 11.1, maxThrust: 5, yawRatio: 0.015, maxAmps: 18, lag: 0.03 };

/** An ESC's throttle from its pulse width: 1000 µs is off, 2000 µs full; anything else isn't a valid signal */
export function escThrottle(pulseUs: number): number | null {
    if (pulseUs < 800 || pulseUs > 2200) return null;
    return Math.max(0, Math.min(1, (pulseUs - 1050) / 900));   // a little dead band above 1000 µs
}

/** A DC motor's model, from its datasheet-style props: winding resistance, back-EMF/torque constant, friction, inertia. */
export interface MotorModel { ohms: number; ke: number; friction: number; inertia: number; stallTorque: number }

export function motorModel(volts: number, rpm: number, stallAmps: number): MotorModel {
    const ohms = volts / stallAmps;
    const noLoadAmps = stallAmps * 0.15;                       // small motors idle at about a sixth of stall current
    const omega = rpm * 2 * Math.PI / 60;
    const ke = (volts - noLoadAmps * ohms) / omega;            // V·s/rad, and N·m/A (SI: the same number)
    const friction = ke * noLoadAmps / omega;                  // viscous: eats the no-load current at no-load speed
    const stallTorque = ke * stallAmps;
    // the shaft's inertia (rotor through the gearbox, plus a wheel) for a mechanical time constant of about 30 ms
    const inertia = 0.03 * ke * ke / ohms;
    return { ohms, ke, friction, inertia, stallTorque };
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
    private readonly digits: { part: string; segments: Diode[] }[] = [];
    private readonly screens: { part: string; device: LcdBackpack | Ssd1306 }[] = [];
    /** Servos. One that drives a joint in the world is `attached`: it hands over `target`, the world sets `angle`. */
    readonly servos: { part: string; sigNode: Node; angle: number; target: number; speed: number; torque: number; attached: boolean }[] = [];
    private readonly buttons: { part: string; sw: Switch }[] = [];
    private readonly sources: { part: string; source: VoltageSource; ohms: number }[] = [];
    private readonly resistors: { part: string; r: Resistor }[] = [];
    private readonly pots: { part: string; ra: Resistor; rb: Resistor }[] = [];
    private readonly ldrs: { part: string; r: Resistor }[] = [];
    private readonly dead = new Set<string>();
    private picoPart: string | null = null;
    /** Motors: an internal node, the winding resistance and the back-EMF source, and the shaft's state */
    /** Motors. One that drives a wheel in the world is `attached`: the world sets its speed and takes its `torque`. */
    readonly motors: { part: string; r: Resistor; emf: VoltageSource; model: MotorModel; omega: number; angle: number; amps: number; stalled: number; load: number; extLoad: number; attached: boolean; torque: number }[] = [];
    /** Brushless motors behind ESCs: the throttle their pulses ask for, the prop's speed, thrust and yaw torque */
    readonly quadMotors: { part: string; sigNode: Node; supply: Node; ground: Node; draw: CurrentSource; omega: number; thrust: number; yaw: number; spin: 1 | -1; armed: boolean; lowFor: number; badFor: number; amps: number; lastHigh: number }[] = [];
    private readonly rangers: { part: string; vcc: Node; gnd: Node; trig: Node; echoPin: Node; echo: VoltageSource; trigHigh: number; falls: number; echoStart: number; echoEnd: number }[] = [];
    /** Sensors moved by the world (an IMU on a quad): their live readings, in place of their props */
    readonly motion = new Map<string, Motion>();
    /** Called after every step (the world couples here) */
    afterTick?: (dt: number) => void;
    private readonly drivers6612: { part: string; vcc: Node; gnd: Node; stby: Node; ins: Node[][]; outs: { hi: Switch; lo: Switch }[][] }[] = [];
    private readonly lineSensors: { part: string; vcc: Node; gnd: Node; ao: VoltageSource; dout: VoltageSource; doStage: Resistor; detecting: boolean }[] = [];
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
            case 'sevenseg': {
                // eight LEDs sharing one pin: their cathodes (common cathode) or their anodes (common anode)
                const model = LED_MODELS[String(props.colour)] ?? LED_MODELS.red, anode = props.common === 'anode';
                const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'].map(seg => this.net.add(anode ? new Diode(n('com'), n(seg), model.is, model.n) : new Diode(n(seg), n('com'), model.is, model.n)));
                this.digits.push({ part: id, segments });
                break;
            }
            case 'button': this.buttons.push({ part: id, sw: this.net.add(new Switch(n('a'), n('b'), props.pressed === true)) }); break;
            case 'potentiometer': {
                const ohms = num('ohms'), pos = Math.max(0.001, Math.min(0.999, num('position')));
                this.pots.push({ part: id, ra: this.net.add(new Resistor(n('a'), n('w'), ohms * pos)), rb: this.net.add(new Resistor(n('w'), n('b'), ohms * (1 - pos))) });
                break;
            }
            case 'ldr': this.ldrs.push({ part: id, r: this.net.add(new Resistor(n('a'), n('b'), ldrOhms(num('light')))) }); break;
            case 'tmp102': case 'ads1115': case 'mpu6050': case 'lcd': case 'oled': {
                const part = this.project.parts.find(p => p.id === id)!;
                const prop = (key: string) => Number(part.props[key]);
                const address = parseInt(String(props.address), 16);
                const vcc = n(kind === 'ads1115' ? 'VDD' : 'VCC'), gnd = n('GND');
                // what it draws: a sensor ~100 µA; the LCD's backlight ~20 mA and an OLED ~15 mA from 5 V
                this.net.add(new Resistor(vcc, gnd, kind === 'lcd' ? 250 : kind === 'oled' ? 330 : 33_000));
                const pullup = kind === 'lcd' || kind === 'oled' ? 4700 : 10_000;
                this.net.add(new Resistor(n('SDA'), vcc, pullup));  // breakout boards carry I²C pull-ups
                this.net.add(new Resistor(n('SCL'), vcc, pullup));
                let device: I2CDevice;
                if (kind === 'lcd' || kind === 'oled') {
                    const [w, h] = String(props.size).split('x').map(Number);
                    const screen = kind === 'lcd' ? new LcdBackpack(address, w === 20 ? 20 : 16, h === 4 ? 4 : 2) : new Ssd1306(address, 128, h === 32 ? 32 : 64);
                    this.screens.push({ part: id, device: screen });
                    device = screen;
                } else if (kind === 'tmp102') device = new Tmp102(address, () => prop('temperature'));
                else if (kind === 'mpu6050') device = new Mpu6050(address, () => this.motion.get(id) ?? { pitch: prop('pitch'), roll: prop('roll'), gx: 0, gy: 0, gz: prop('turn'), celsius: prop('temperature') });
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
            case 'motor': {
                const model = motorModel(num('volts'), num('rpm'), num('stall'));
                const mid = this.net.node();
                const r = this.net.add(new Resistor(n('+'), mid, model.ohms));
                const emf = this.net.add(new VoltageSource(mid, n('-'), 0));
                this.motors.push({ part: id, r, emf, model, omega: 0, angle: 0, amps: 0, stalled: 0, load: num('load'), extLoad: 0, attached: false, torque: 0 });
                break;
            }
            case 'tb6612': {
                const vm = n('VM'), gnd = n('GND');
                this.net.add(new Resistor(n('VCC'), gnd, 10_000));                     // logic supply: about 0.5 mA
                for (const pin of ['STBY', 'AIN1', 'AIN2', 'PWMA', 'BIN1', 'BIN2', 'PWMB']) this.net.add(new Resistor(n(pin), gnd, 200_000));   // its inputs' pull-downs
                const out = (pin: string) => ({ hi: this.net.add(new Switch(vm, n(pin), false, 0.5)), lo: this.net.add(new Switch(n(pin), gnd, false, 0.5)) });
                this.drivers6612.push({ part: id, vcc: n('VCC'), gnd, stby: n('STBY'), ins: [[n('AIN1'), n('AIN2'), n('PWMA')], [n('BIN1'), n('BIN2'), n('PWMB')]], outs: [[out('AO1'), out('AO2')], [out('BO1'), out('BO2')]] });
                break;
            }
            case 'tcrt5000': {
                const gnd = n('GND');
                this.net.add(new Resistor(n('VCC'), gnd, 330));                         // the IR LED: about 15 mA at 5 V
                const ao = this.net.add(new VoltageSource(this.net.node(), gnd, 0));
                this.net.add(new Resistor(ao.a, n('AO'), 10_000));
                const dout = this.net.add(new VoltageSource(this.net.node(), gnd, 0));
                const doStage = this.net.add(new Resistor(dout.a, n('DO'), 1000));
                this.lineSensors.push({ part: id, vcc: n('VCC'), gnd, ao, dout, doStage, detecting: false });
                break;
            }
            case 'quadmotor': {
                const draw = this.net.add(new CurrentSource(n('v'), n('gnd'), 0));
                this.net.add(new Resistor(n('sig'), n('gnd'), 1e6));
                this.net.add(new Resistor(n('v'), n('gnd'), 5000));                    // the ESC's own electronics
                this.quadMotors.push({ part: id, sigNode: n('sig'), supply: n('v'), ground: n('gnd'), draw, omega: 0, thrust: 0, yaw: 0, spin: props.spin === 'CCW' ? -1 : 1, armed: false, lowFor: 0, badFor: 0, amps: 0, lastHigh: -1 });
                break;
            }
            case 'hcsr04': {
                const gnd = n('GND');
                this.net.add(new Resistor(n('VCC'), gnd, 330));                         // ~15 mA
                this.net.add(new Resistor(n('TRIG'), gnd, 100_000));
                const echo = this.net.add(new VoltageSource(this.net.node(), gnd, 0));
                this.net.add(new Resistor(echo.a, n('ECHO'), 1000));
                this.rangers.push({ part: id, vcc: n('VCC'), gnd, trig: n('TRIG'), echoPin: n('ECHO'), echo, trigHigh: 0, falls: 0, echoStart: -1, echoEnd: -1 });
                break;
            }
            case 'servo': {
                this.net.add(new Resistor(n('sig'), GROUND, 1e6));           // the signal input
                this.net.add(new Resistor(n('v'), n('gnd'), 50));            // ~100 mA from 5 V
                const model = SERVO_MODELS[String(props.model)] ?? SERVO_MODELS.SG90;
                this.servos.push({ part: id, sigNode: n('sig'), angle: 90, target: 90, speed: model.speed, torque: model.torque, attached: false });
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
        for (const m of this.motors) if (m.part === id && key === 'load') m.load = v;
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
        this.preSolve();
        this.solution = this.net.step(dt, this.solution ?? undefined);
        const v = this.solution.v;
        this.time += dt;
        this.postSolve(v, dt);

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
        for (const d of this.digits) this.states.set(d.part, { segments: d.segments.map(seg => ledBrightness(seg.current(v))) });
        for (const s of this.screens) {
            // an unpowered screen is blank; a powered one shows what its controller holds
            const dev = this.i2cDevices.find(x => x.part === s.part)!;
            const powered = dev.supplied && v[dev.vcc] - v[dev.gnd] >= I2C_MIN_VOLTS;
            this.states.set(s.part, { screen: powered ? s.device.screen : undefined });
        }
        for (const s of this.servos) {
            const driver = this.drivers.find(d => d.node === s.sigNode && d.mode === 'output' && d.activity);
            const pulse = driver?.activity?.pulseUs ?? 0;
            if (pulse >= 400 && pulse <= 2600) s.target = Math.max(0, Math.min(180, (pulse - SERVO_MIN_US) / (SERVO_MAX_US - SERVO_MIN_US) * 180));
            if (!s.attached) {                                                    // on the bench: it turns at its rated speed
                const rate = s.speed * dt;
                s.angle += Math.max(-rate, Math.min(rate, s.target - s.angle));
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
        this.afterTick?.(dt);
    }

    /** Parts whose outputs depend on their inputs: set from the last step's voltages (one tick of delay, 0.2 ms). */
    private preSolve() {
        const v = this.solution?.v;
        const volts = (node: Node) => v ? v[node] : 0;
        for (const d of this.drivers6612) {
            const vcc = volts(d.vcc) - volts(d.gnd);
            const high = (node: Node) => volts(node) - volts(d.gnd) > Math.max(1.4, vcc * 0.7);
            const on = vcc >= 2.7 && high(d.stby);
            d.ins.forEach(([in1, in2, pwm], ch) => {
                const a = high(in1), b = high(in2), p = high(pwm);
                // TB6612's truth table: forward, reverse, short brake (both low sides) or off
                const [o1, o2] = !on ? ['off', 'off'] : a && b ? ['low', 'low'] : !a && !b ? ['off', 'off'] : !p ? ['low', 'low'] : a ? ['high', 'low'] : ['low', 'high'];
                [o1, o2].forEach((state, k) => { const sw = d.outs[ch][k]; sw.hi.closed = state === 'high'; sw.lo.closed = state === 'low'; });
            });
        }
        for (const s of this.lineSensors) {
            const vcc = volts(s.vcc) - volts(s.gnd);
            const part = this.project.parts.find(p => p.id === s.part)!;
            const reflect = Math.max(0, Math.min(1, Number(part.props.reflect))), threshold = Number(part.props.threshold);
            const powered = vcc > 2.5;
            const ao = powered ? vcc * (0.08 + 0.84 * (1 - reflect)) : 0;     // dark surface: little light back, AO high
            s.ao.volts = ao;
            const dark = ao > threshold * vcc;
            s.dout.volts = powered && dark ? vcc : 0;
            s.doStage.ohms = powered && dark ? 1000 : 50;                     // the comparator's pull-up vs its open collector
            s.detecting = powered && !dark;
        }
        for (const m of this.motors) m.emf.volts = m.model.ke * m.omega;
        // an ESC draws power with the cube of its prop's speed (a prop's load)
        const omegaMax = QUAD_MOTOR.kv * QUAD_MOTOR.nominalVolts * QUAD_MOTOR.efficiency * 2 * Math.PI / 60;
        for (const q of this.quadMotors) { q.amps = QUAD_MOTOR.maxAmps * Math.pow(Math.min(1.2, q.omega / omegaMax), 3); q.draw.amps = q.amps; }
        // the rangefinder: a trigger pulse starts a burst; the echo pin then stays high for 58 µs per centimetre
        for (const r of this.rangers) {
            const powered = volts(r.vcc) - volts(r.gnd) > 4;
            const now = this.time + TICK;                                     // where the boards' clocks are now
            r.echo.volts = powered && now >= r.echoStart && now < r.echoEnd ? volts(r.vcc) - volts(r.gnd) : 0;
        }
    }

    /** Motors turn: current makes torque; friction, load and inertia decide the speed. */
    private postSolve(v: number[], dt: number) {
        for (const m of this.motors) {
            const { ke, friction, inertia, stallTorque } = m.model;
            m.amps = m.r.current(v);
            const drive = ke * m.amps - friction * m.omega;
            m.torque = drive;
            if (m.attached) {                                                  // the world turns this shaft
                m.angle += m.omega * dt;
                this.states.set(m.part, { rpm: m.omega * 60 / (2 * Math.PI), amps: m.amps, turned: (m.angle * 180 / Math.PI) % 360 });
                continue;
            }
            const load = (m.load * stallTorque) + m.extLoad;                   // opposes motion (or a stalled shaft)
            let torque = drive;
            if (Math.abs(m.omega) < 1e-3 && Math.abs(drive) <= load) { m.omega = 0; torque = 0; }
            else torque -= Math.sign(m.omega || drive) * load;
            m.omega += torque / inertia * dt;
            m.angle += m.omega * dt;
            const stallAmps = stallTorque / ke;
            m.stalled = Math.abs(m.omega) < 0.5 && Math.abs(m.amps) > 0.6 * stallAmps ? m.stalled + dt : 0;
            if (m.stalled > 2) this.warn(m.part, `${m.part} is stalled and drawing ${Math.abs(m.amps).toFixed(2)} A: a real motor would be getting hot.`);
            this.states.set(m.part, { rpm: m.omega * 60 / (2 * Math.PI), amps: m.amps, turned: (m.angle * 180 / Math.PI) % 360 });
        }
        for (const s of this.lineSensors) this.states.set(s.part, { led: s.detecting, volts: v[s.ao.a] - v[s.gnd] });
        this.escs(v, dt);
        for (const r of this.rangers) {
            // when the trigger pulse ended: a board pin's own record of its edges (a 10 µs pulse is shorter than a
            // step), otherwise the level the circuit settled at
            let ended: number | null = null;
            const trigger = this.drivers.find(d => d.node === r.trig && d.mode === 'output')?.activity;
            if (trigger?.falls !== undefined) {
                if (trigger.falls !== r.falls) ended = this.time - (trigger.fellAgo ?? 0);
                r.falls = trigger.falls;
            } else if (v[r.trig] - v[r.gnd] > 2.5) r.trigHigh += dt;
            else { if (r.trigHigh > 0) ended = this.time; r.trigHigh = 0; }
            if (ended === null || ended < r.echoEnd || v[r.vcc] - v[r.gnd] <= 4) continue;   // busy, or unpowered
            const cm = Number(this.project.parts.find(p => p.id === r.part)!.props.distance);
            r.echoStart = ended + 0.00025;                                     // the 8-cycle 40 kHz burst
            r.echoEnd = r.echoStart + (cm >= 2 && cm <= 400 ? cm * 58e-6 : 0.038);   // out of range: a 38 ms echo
            // an Uno times pulseIn() to the cycle, so it gets the echo's edges exactly; other boards see them per step
            const echoPin = this.drivers.find(d => d.node === r.echoPin && d.board === 'uno');
            if (echoPin && this.board) {
                const pin = echoPin.name.startsWith('A') ? 14 + Number(echoPin.name.slice(1)) : Number(echoPin.name.slice(1));
                this.board.scheduleInput(pin, true, r.echoStart - this.time);
                this.board.scheduleInput(pin, false, r.echoEnd - this.time);
            }
        }
        for (const d of this.drivers6612) {
            const vcc = v[d.vcc] - v[d.gnd];
            if (vcc >= 2.7 && v[d.stby] - v[d.gnd] < 1.4 && this.time > 0.2 && this.drivers.some(x => x.mode === 'output')) this.warn(d.part, `${d.part}: STBY is low, so both motor outputs are off. Tie STBY to VCC (or drive it high).`);
        }
    }

    /** ESCs: arm on a low pulse after power-up, follow their throttle with the prop's lag, give up on a lost signal. */
    private escs(v: number[], dt: number) {
        const omegaNominal = QUAD_MOTOR.kv * QUAD_MOTOR.nominalVolts * QUAD_MOTOR.efficiency * 2 * Math.PI / 60;
        const kT = QUAD_MOTOR.maxThrust / (omegaNominal * omegaNominal);
        for (const q of this.quadMotors) {
            const supply = v[q.supply] - v[q.ground];
            const driver = this.drivers.find(d => d.node === q.sigNode && d.mode === 'output' && d.activity);
            // a signal is pulses: a pin that hasn't gone high for 50 ms (two and a half frames) is no signal, whatever
            // width its last pulse had
            const a = driver?.activity;
            if (a && (a.high || a.duty > 0)) q.lastHigh = this.time;
            const live = q.lastHigh >= 0 && this.time - q.lastHigh < 0.05;
            const throttle = supply > 6 && live ? escThrottle(a?.pulseUs ?? 0) : null;
            if (throttle === null) { q.badFor += dt; if (q.badFor > 0.5) { q.armed = false; q.lowFor = 0; } }
            else {
                q.badFor = 0;
                if (!q.armed) { q.lowFor = throttle === 0 ? q.lowFor + dt : 0; if (q.lowFor >= 0.3) q.armed = true; }
            }
            const target = q.armed && throttle !== null ? throttle * omegaNominal * (supply / QUAD_MOTOR.nominalVolts) : 0;
            q.omega += (target - q.omega) * Math.min(1, dt / QUAD_MOTOR.lag);
            q.thrust = kT * q.omega * q.omega;
            q.yaw = q.spin * QUAD_MOTOR.yawRatio * q.thrust;                    // a CW prop twists the frame CCW (+)
            if (supply > 6 && !q.armed && throttle !== null && throttle > 0 && this.time > 1) this.warn(q.part, `${q.part}: the ESC isn\u2019t armed. Send it 1000 µs for a moment after power-up, then raise the throttle.`);
            this.states.set(q.part, { rpm: q.omega * 60 / (2 * Math.PI), thrust: q.thrust, amps: q.amps, armed: q.armed });
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
