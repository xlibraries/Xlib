// The templates: ready-wired projects with a sketch and its compiled hex, so the first click is "Run".
import { addPart, connect, emptyProject, type Project } from '../sim/project';
import { TEMPLATE_CODE } from './generated';

export interface Template {
    id: string;
    title: string;
    blurb: string;
    build(): Project;
}

const code = (name: string) => ({ board: 'uno' as const, sketch: TEMPLATE_CODE[name].sketch, hex: TEMPLATE_CODE[name].hex });

export const TEMPLATES: Template[] = [
    {
        id: 'blink', title: 'Blink', blurb: 'An LED on pin 13 through a resistor, and the first sketch everyone writes.',
        build() {
            const p = emptyProject('Blink');
            p.code = code('blink');
            addPart(p, 'uno', 4, 4);
            const r = addPart(p, 'resistor', 24, 6), led = addPart(p, 'led', 32, 10);
            connect(p, { part: 'uno1', pin: 'D13' }, { part: r.id, pin: 'a' });
            connect(p, { part: r.id, pin: 'b' }, { part: led.id, pin: 'a' });
            connect(p, { part: led.id, pin: 'k' }, { part: 'uno1', pin: 'GND' });
            return p;
        },
    },
    {
        id: 'button', title: 'Button', blurb: 'A push button on pin 2 with the internal pull-up; the LED follows it and Serial reports presses.',
        build() {
            const p = emptyProject('Button');
            p.code = code('button');
            addPart(p, 'uno', 4, 4);
            const b = addPart(p, 'button', 24, 16), r = addPart(p, 'resistor', 24, 6), led = addPart(p, 'led', 32, 10);
            connect(p, { part: 'uno1', pin: 'D2' }, { part: b.id, pin: 'a' });
            connect(p, { part: b.id, pin: 'b' }, { part: 'uno1', pin: 'GND' });
            connect(p, { part: 'uno1', pin: 'D13' }, { part: r.id, pin: 'a' });
            connect(p, { part: r.id, pin: 'b' }, { part: led.id, pin: 'a' });
            connect(p, { part: led.id, pin: 'k' }, { part: 'uno1', pin: 'GND2' });
            return p;
        },
    },
    {
        id: 'servo_sweep', title: 'Servo sweep', blurb: 'An SG90 on pin 9 swinging 0–180°: the Servo library and a 50 Hz pulse you can see on the monitor.',
        build() {
            const p = emptyProject('Servo sweep');
            p.code = code('servo_sweep');
            addPart(p, 'uno', 4, 4);
            const s = addPart(p, 'servo', 26, 8);
            connect(p, { part: 'uno1', pin: 'D9' }, { part: s.id, pin: 'sig' });
            connect(p, { part: 'uno1', pin: '5V' }, { part: s.id, pin: 'v' });
            connect(p, { part: 'uno1', pin: 'GND' }, { part: s.id, pin: 'gnd' });
            return p;
        },
    },
    {
        id: 'hello_serial', title: 'Hello, serial', blurb: 'A knob on A0 and a sketch that prints what it reads once a second.',
        build() {
            const p = emptyProject('Hello, serial');
            p.code = code('hello_serial');
            addPart(p, 'uno', 4, 4);
            const pot = addPart(p, 'potentiometer', 26, 14);   // position 0..1 reads 0..5 V
            connect(p, { part: 'uno1', pin: 'GND' }, { part: pot.id, pin: 'a' });
            connect(p, { part: 'uno1', pin: 'A0' }, { part: pot.id, pin: 'w' });
            connect(p, { part: 'uno1', pin: '5V' }, { part: pot.id, pin: 'b' });
            return p;
        },
    },
    {
        id: 'rc', title: 'RC circuit', blurb: 'No code: a battery, a button, a resistor and a capacitor. Press and watch the capacitor charge on the monitor.',
        build() {
            const p = emptyProject('RC circuit');
            const bat = addPart(p, 'battery', 4, 6), b = addPart(p, 'button', 12, 4), r = addPart(p, 'resistor', 20, 4), c = addPart(p, 'capacitor', 28, 8);
            r.props.ohms = 10_000; c.props.farads = 100e-6;   // τ = 1 s
            bat.props.volts = 5;
            connect(p, { part: bat.id, pin: '+' }, { part: b.id, pin: 'a' });
            connect(p, { part: b.id, pin: 'b' }, { part: r.id, pin: 'a' });
            connect(p, { part: r.id, pin: 'b' }, { part: c.id, pin: 'a' });
            connect(p, { part: c.id, pin: 'b' }, { part: bat.id, pin: '-' });
            return p;
        },
    },
];

export function template(id: string): Template | undefined { return TEMPLATES.find(t => t.id === id); }
