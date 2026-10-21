// The parts you can put on the bench: what they look like (pins on a symbol), what they're called, their
// adjustable properties. How each behaves electrically lives in bench.ts, which turns a project into a net.

export type PinKind = 'power' | 'ground' | 'digital' | 'analog' | 'passive' | 'signal';

export interface PinSpec {
    id: string;
    label: string;
    kind: PinKind;
    /** Position on the symbol, 0..1 of its width/height */
    x: number;
    y: number;
}

export interface PropSpec {
    label: string;
    default: number | string | boolean;
    unit?: string;
    min?: number;
    max?: number;
    /** For string props: the choices */
    options?: string[];
}

export type Group = 'board' | 'power' | 'passive' | 'bench' | 'drive' | 'sensor';

export interface PartSpec {
    kind: string;
    title: string;
    group: Group;
    description: string;
    /** Symbol size on the bench, in grid units (16 px) */
    width: number;
    height: number;
    pins: PinSpec[];
    props: Record<string, PropSpec>;
}

const side = (ids: string[], kinds: PinKind[], x: number, top = 0.1, bottom = 0.9, labels?: string[]): PinSpec[] =>
    ids.map((id, i) => ({ id, label: labels?.[i] ?? id, kind: kinds[i] ?? kinds[0], x, y: ids.length === 1 ? 0.5 : top + (bottom - top) * i / (ids.length - 1) }));

export const UNO_DIGITAL = Array.from({ length: 14 }, (_, i) => `D${i}`);
export const UNO_ANALOG = Array.from({ length: 6 }, (_, i) => `A${i}`);

export const CATALOG: Record<string, PartSpec> = {
    uno: {
        kind: 'uno', title: 'Arduino Uno', group: 'board', width: 14, height: 12,
        description: 'ATmega328P at 16 MHz, 14 digital pins (6 PWM), 6 analog inputs, 5 V logic. Runs your sketch.',
        pins: [
            ...side([...UNO_DIGITAL].reverse(), UNO_DIGITAL.map(() => 'digital' as PinKind), 1, 0.08, 0.92),
            ...side(UNO_ANALOG, UNO_ANALOG.map(() => 'analog' as PinKind), 0, 0.5, 0.92),
            { id: '5V', label: '5V', kind: 'power', x: 0, y: 0.1 }, { id: '3V3', label: '3.3V', kind: 'power', x: 0, y: 0.2 },
            { id: 'GND', label: 'GND', kind: 'ground', x: 0, y: 0.3 }, { id: 'GND2', label: 'GND', kind: 'ground', x: 0, y: 0.4 },
        ],
        props: {},
    },
    battery: {
        kind: 'battery', title: 'Battery', group: 'power', width: 4, height: 6,
        description: 'A battery pack with a little internal resistance, so it sags under load.',
        pins: [{ id: '+', label: '+', kind: 'power', x: 0.5, y: 0 }, { id: '-', label: '−', kind: 'ground', x: 0.5, y: 1 }],
        props: { volts: { label: 'Voltage', default: 9, unit: 'V', min: 1.5, max: 24 }, ohms: { label: 'Internal resistance', default: 0.5, unit: 'Ω', min: 0, max: 10 } },
    },
    resistor: {
        kind: 'resistor', title: 'Resistor', group: 'passive', width: 5, height: 2,
        description: 'Limits current. Colour bands tell the value; the inspector lets you type it.',
        pins: [{ id: 'a', label: '1', kind: 'passive', x: 0, y: 0.5 }, { id: 'b', label: '2', kind: 'passive', x: 1, y: 0.5 }],
        props: { ohms: { label: 'Resistance', default: 220, unit: 'Ω', min: 0.1, max: 10_000_000 } },
    },
    capacitor: {
        kind: 'capacitor', title: 'Capacitor', group: 'passive', width: 3, height: 3,
        description: 'Stores charge: smooths supplies, times things with a resistor (τ = R·C).',
        pins: [{ id: 'a', label: '+', kind: 'passive', x: 0, y: 0.5 }, { id: 'b', label: '−', kind: 'passive', x: 1, y: 0.5 }],
        props: { farads: { label: 'Capacitance', default: 100e-6, unit: 'F', min: 1e-12, max: 1 } },
    },
    led: {
        kind: 'led', title: 'LED', group: 'bench', width: 3, height: 4,
        description: 'Lights with current from anode (+, long leg) to cathode. Needs a resistor on 5 V, or it burns.',
        pins: [{ id: 'a', label: '+', kind: 'passive', x: 0.5, y: 0 }, { id: 'k', label: '−', kind: 'passive', x: 0.5, y: 1 }],
        props: { colour: { label: 'Colour', default: 'red', options: ['red', 'green', 'blue', 'yellow', 'white'] } },
    },
    button: {
        kind: 'button', title: 'Push button', group: 'bench', width: 4, height: 3,
        description: 'Connects its two sides while pressed. Click it on the bench.',
        pins: [{ id: 'a', label: '1', kind: 'passive', x: 0, y: 0.5 }, { id: 'b', label: '2', kind: 'passive', x: 1, y: 0.5 }],
        props: { pressed: { label: 'Pressed', default: false } },
    },
    potentiometer: {
        kind: 'potentiometer', title: 'Potentiometer', group: 'bench', width: 4, height: 4,
        description: 'A knob: a resistor with a wiper. Across a supply it makes an adjustable voltage.',
        pins: [{ id: 'a', label: '1', kind: 'passive', x: 0, y: 0.8 }, { id: 'w', label: 'wiper', kind: 'passive', x: 0.5, y: 0 }, { id: 'b', label: '2', kind: 'passive', x: 1, y: 0.8 }],
        props: { ohms: { label: 'Resistance', default: 10_000, unit: 'Ω', min: 100, max: 1_000_000 }, position: { label: 'Position', default: 0.5, min: 0, max: 1 } },
    },
    ldr: {
        kind: 'ldr', title: 'Light sensor (LDR)', group: 'sensor', width: 4, height: 3,
        description: 'A resistor that falls with light: about 1 kΩ in daylight, 100 kΩ in the dark.',
        pins: [{ id: 'a', label: '1', kind: 'passive', x: 0, y: 0.5 }, { id: 'b', label: '2', kind: 'passive', x: 1, y: 0.5 }],
        props: { light: { label: 'Light', default: 0.6, min: 0, max: 1 } },
    },
    servo: {
        kind: 'servo', title: 'Servo (SG90)', group: 'drive', width: 6, height: 5,
        description: 'Turns to the angle its signal asks for: a 50 Hz pulse of 0.5–2.5 ms. Draws from 5 V.',
        pins: [{ id: 'sig', label: 'signal', kind: 'signal', x: 0, y: 0.25 }, { id: 'v', label: '5V', kind: 'power', x: 0, y: 0.5 }, { id: 'gnd', label: 'GND', kind: 'ground', x: 0, y: 0.75 }],
        props: {},
    },
};

export const GROUPS: { id: Group; title: string }[] = [
    { id: 'board', title: 'Boards' }, { id: 'power', title: 'Power' }, { id: 'passive', title: 'Passives' },
    { id: 'bench', title: 'Bench' }, { id: 'drive', title: 'Drive' }, { id: 'sensor', title: 'Sensors' },
];

export function pinSpec(kind: string, pin: string): PinSpec | undefined {
    return CATALOG[kind]?.pins.find(p => p.id === pin);
}

/** The props of a new part: the catalog's defaults. */
export function defaultProps(kind: string): Record<string, number | string | boolean> {
    return Object.fromEntries(Object.entries(CATALOG[kind]?.props ?? {}).map(([k, p]) => [k, p.default]));
}

/** LED electrical models by colour: saturation current and ideality give the forward voltage. */
export const LED_MODELS: Record<string, { is: number; n: number; vf: number; rgb: string }> = {
    red: { is: 1e-16, n: 2.2, vf: 1.8, rgb: '#ff3b30' },
    yellow: { is: 1e-16, n: 2.4, vf: 2.0, rgb: '#ffd60a' },
    green: { is: 1e-16, n: 2.5, vf: 2.1, rgb: '#34c759' },
    blue: { is: 1e-16, n: 3.6, vf: 3.0, rgb: '#2f7cff' },
    white: { is: 1e-16, n: 3.7, vf: 3.1, rgb: '#f4f4f0' },
};
