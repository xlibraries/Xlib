// The templates: ready-wired projects with a sketch and its compiled hex, so the first click is "Run".
import { addPart, connect, emptyProject, type Project } from '../sim/project';
import { ovalTrack } from '../sim/track';
import { sketchHash } from '../compile';
import { TEMPLATE_CODE } from './generated';

export interface Template {
    id: string;
    title: string;
    blurb: string;
    build(): Project;
}

const code = (name: string) => ({ board: 'uno' as const, sketch: TEMPLATE_CODE[name].sketch, hex: TEMPLATE_CODE[name].hex, builtFrom: sketchHash(TEMPLATE_CODE[name].sketch) });

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
    {
        id: 'temperature', title: 'Temperature (I²C)', blurb: 'A TMP102 on the Uno\u2019s I²C pins: the Wire library reads it and Serial prints the temperature.',
        build() {
            const p = emptyProject('Temperature');
            p.code = code('temperature');
            addPart(p, 'uno', 4, 4);
            const t = addPart(p, 'tmp102', 26, 8);
            connect(p, { part: 'uno1', pin: 'A4' }, { part: t.id, pin: 'SDA' });
            connect(p, { part: 'uno1', pin: 'A5' }, { part: t.id, pin: 'SCL' });
            connect(p, { part: 'uno1', pin: '3V3' }, { part: t.id, pin: 'VCC' });
            connect(p, { part: 'uno1', pin: 'GND' }, { part: t.id, pin: 'GND' });
            return p;
        },
    },
    {
        id: 'motor_driver', title: 'Motor and driver', blurb: 'A TB6612 between the Uno and a gear motor: direction pins, PWM for speed, a battery for the motor.',
        build() {
            const p = emptyProject('Motor and driver');
            p.code = code('motor_driver');
            addPart(p, 'uno', 4, 4);
            const d = addPart(p, 'tb6612', 24, 4), m = addPart(p, 'motor', 38, 6), b = addPart(p, 'battery', 38, 16);
            b.props.volts = 6;
            for (const [from, to] of [['D5', 'PWMA'], ['D7', 'AIN1'], ['D8', 'AIN2'], ['D9', 'STBY'], ['5V', 'VCC'], ['GND', 'GND']] as const) connect(p, { part: 'uno1', pin: from }, { part: d.id, pin: to });
            connect(p, { part: d.id, pin: 'AO1' }, { part: m.id, pin: '+' });
            connect(p, { part: d.id, pin: 'AO2' }, { part: m.id, pin: '-' });
            connect(p, { part: b.id, pin: '+' }, { part: d.id, pin: 'VM' });
            connect(p, { part: b.id, pin: '-' }, { part: 'uno1', pin: 'GND2' });
            return p;
        },
    },
    {
        id: 'robot_square', title: 'Robot (World)', blurb: 'Two gear motors through a TB6612 on a robot in the World: it drives a square, open-loop.',
        build() {
            const p = emptyProject('Robot');
            p.code = code('robot_square');
            addPart(p, 'uno', 4, 4);
            const d = addPart(p, 'tb6612', 24, 4), left = addPart(p, 'motor', 38, 2), right = addPart(p, 'motor', 38, 10), b = addPart(p, 'battery', 38, 18);
            b.props.volts = 6;
            for (const [from, to] of [['D5', 'PWMA'], ['D7', 'AIN1'], ['D8', 'AIN2'], ['D6', 'PWMB'], ['D11', 'BIN1'], ['D12', 'BIN2'], ['D9', 'STBY'], ['5V', 'VCC'], ['GND', 'GND']] as const) connect(p, { part: 'uno1', pin: from }, { part: d.id, pin: to });
            connect(p, { part: d.id, pin: 'AO1' }, { part: left.id, pin: '+' });
            connect(p, { part: d.id, pin: 'AO2' }, { part: left.id, pin: '-' });
            connect(p, { part: d.id, pin: 'BO1' }, { part: right.id, pin: '+' });
            connect(p, { part: d.id, pin: 'BO2' }, { part: right.id, pin: '-' });
            connect(p, { part: b.id, pin: '+' }, { part: d.id, pin: 'VM' });
            connect(p, { part: b.id, pin: '-' }, { part: 'uno1', pin: 'GND2' });
            p.world = { robot: { left: left.id, right: right.id, sensors: [], x: -0.3, z: 0.3, heading: 0 }, track: ovalTrack() };
            return p;
        },
    },
    {
        id: 'line_follower', title: 'Line follower (World)', blurb: 'Two line sensors either side of the tape steer a two-wheeled robot round the oval. Laps are timed.',
        build() {
            const p = emptyProject('Line follower');
            p.code = code('line_follower');
            addPart(p, 'uno', 4, 4);
            const d = addPart(p, 'tb6612', 24, 4), left = addPart(p, 'motor', 38, 2), right = addPart(p, 'motor', 38, 10), b = addPart(p, 'battery', 38, 18);
            const sl = addPart(p, 'tcrt5000', 4, 22), sr = addPart(p, 'tcrt5000', 12, 22);
            b.props.volts = 6;
            for (const [from, to] of [['D5', 'PWMA'], ['D7', 'AIN1'], ['D8', 'AIN2'], ['D6', 'PWMB'], ['D11', 'BIN1'], ['D12', 'BIN2'], ['D9', 'STBY'], ['5V', 'VCC'], ['GND', 'GND']] as const) connect(p, { part: 'uno1', pin: from }, { part: d.id, pin: to });
            connect(p, { part: d.id, pin: 'AO1' }, { part: left.id, pin: '+' });
            connect(p, { part: d.id, pin: 'AO2' }, { part: left.id, pin: '-' });
            connect(p, { part: d.id, pin: 'BO1' }, { part: right.id, pin: '+' });
            connect(p, { part: d.id, pin: 'BO2' }, { part: right.id, pin: '-' });
            connect(p, { part: b.id, pin: '+' }, { part: d.id, pin: 'VM' });
            connect(p, { part: b.id, pin: '-' }, { part: 'uno1', pin: 'GND2' });
            for (const [s, pin] of [[sl, 'D2'], [sr, 'D3']] as const) {
                connect(p, { part: 'uno1', pin: '5V' }, { part: s.id, pin: 'VCC' });
                connect(p, { part: 'uno1', pin: 'GND' }, { part: s.id, pin: 'GND' });
                connect(p, { part: s.id, pin: 'DO' }, { part: 'uno1', pin });
            }
            const track = ovalTrack();
            const [x0, z0] = track.points[0];
            // just behind the start line, facing along the track; the sensors 7.5 cm ahead, 2 cm either side
            p.world = { robot: { left: left.id, right: right.id, sensors: [{ part: sl.id, x: 0.075, z: -0.02 }, { part: sr.id, x: 0.075, z: 0.02 }], x: x0 - 0.15, z: z0, heading: 0 }, track };
            return p;
        },
    },
];

const PI_BLINK = `# Blink, on a Raspberry Pi: an LED on GPIO17 through a resistor.
from gpiozero import LED
from time import sleep

led = LED(17)
while True:
    led.on()
    sleep(0.5)
    led.off()
    sleep(0.5)
`;

const PI_BUTTON = `# A button on GPIO4 (to ground, with the Pi's pull-up) lights the LED on GPIO17 while held.
from gpiozero import LED, Button
from signal import pause

led = LED(17)
button = Button(4)

button.when_pressed = led.on
button.when_released = led.off
print("press the button")
pause()
`;

const PI_SERVO = `# A servo on GPIO18 sweeps from 0 to 180 degrees and back.
from gpiozero import AngularServo
from time import sleep

servo = AngularServo(18, min_angle=0, max_angle=180, min_pulse_width=0.5/1000, max_pulse_width=2.5/1000)
while True:
    for angle in range(0, 181, 5):
        servo.angle = angle
        sleep(0.03)
    for angle in range(180, -1, -5):
        servo.angle = angle
        sleep(0.03)
`;

function piProject(name: string, script: string): Project {
    const p = emptyProject(name);
    p.code = { board: 'pi', sketch: script, hex: '' };
    addPart(p, 'pi', 4, 2);
    return p;
}

const PI_TEMPERATURE = `# A TMP102 temperature sensor on the Pi's I2C pins (GPIO2 = SDA, GPIO3 = SCL), read with smbus2.
# Change its temperature in the inspector. Try \`i2cdetect -y 1\` in the terminal to see it on the bus.
from smbus2 import SMBus
from time import sleep

TMP102 = 0x48

with SMBus(1) as bus:
    while True:
        high, low = bus.read_i2c_block_data(TMP102, 0, 2)
        raw = ((high << 8) | low) >> 4
        if raw & 0x800:          # below zero
            raw -= 4096
        print(f"temperature: {raw * 0.0625:.2f} C")
        sleep(1)
`;

const PI_KNOB = `# The Pi has no analog inputs, so an ADS1115 reads the knob (A0) over I2C, and the LED on GPIO17 follows it.
from smbus2 import SMBus
from gpiozero import PWMLED
from time import sleep

ADS1115 = 0x48
led = PWMLED(17)

with SMBus(1) as bus:
    while True:
        # start a single conversion of A0 against GND, +-4.096 V
        bus.write_i2c_block_data(ADS1115, 1, [0b11000011, 0b10000011])
        sleep(0.01)
        high, low = bus.read_i2c_block_data(ADS1115, 0, 2)
        raw = int.from_bytes(bytes([high, low]), "big", signed=True)
        volts = raw * 4.096 / 32768
        led.value = max(0.0, min(1.0, volts / 3.3))
        print(f"knob: {volts:.2f} V")
        sleep(0.25)
`;

const PI_MOTOR = `# A gear motor through a TB6612: gpiozero's Motor with an enable pin (direction on GPIO17/GPIO27, PWM on GPIO18).
from gpiozero import Motor
from time import sleep

motor = Motor(forward=17, backward=27, enable=18)

while True:
    for speed in (0.25, 0.5, 1.0):
        motor.forward(speed)
        print("forward", speed)
        sleep(1)
    motor.stop()
    sleep(0.5)
    motor.backward(0.5)
    print("backward 0.5")
    sleep(1)
    motor.stop()
    sleep(0.5)
`;

const PICO_BLINK = `# Blink, on a Raspberry Pi Pico: the LED on the board and one on GP15 take turns.
from machine import Pin
import time

board_led = Pin("LED", Pin.OUT)
led = Pin(15, Pin.OUT)

while True:
    board_led.toggle()
    led.value(not board_led.value())
    time.sleep(0.5)
`;

const PICO_KNOB = `# A knob on GP26 (ADC0) sets the brightness of the LED on GP15 through PWM.
from machine import Pin, PWM, ADC
import time

knob = ADC(26)
led = PWM(Pin(15))
led.freq(1000)

while True:
    reading = knob.read_u16()          # 0..65535
    led.duty_u16(reading)
    print("knob:", round(reading * 3.3 / 65535, 2), "V")
    time.sleep(0.25)
`;

function picoProject(name: string, script: string): Project {
    const p = emptyProject(name);
    p.code = { board: 'pico', sketch: script, hex: '' };
    addPart(p, 'pico', 4, 2);
    return p;
}

TEMPLATES.push(
    {
        id: 'pico_blink', title: 'Blink (Pico, MicroPython)', blurb: 'machine.Pin on a Raspberry Pi Pico: the board\u2019s own LED and one on GP15.',
        build() {
            const p = picoProject('Blink (Pico)', PICO_BLINK);
            const r = addPart(p, 'resistor', 20, 4), led = addPart(p, 'led', 28, 8);
            connect(p, { part: 'pico1', pin: 'GP15' }, { part: r.id, pin: 'a' });
            connect(p, { part: r.id, pin: 'b' }, { part: led.id, pin: 'a' });
            connect(p, { part: led.id, pin: 'k' }, { part: 'pico1', pin: 'GND' });
            return p;
        },
    },
    {
        id: 'pico_knob', title: 'Knob and PWM (Pico, MicroPython)', blurb: 'The Pico\u2019s ADC reads a knob on GP26; PWM dims an LED to match.',
        build() {
            const p = picoProject('Knob (Pico)', PICO_KNOB);
            const k = addPart(p, 'potentiometer', 20, 14), r = addPart(p, 'resistor', 20, 4), led = addPart(p, 'led', 28, 8);
            connect(p, { part: 'pico1', pin: '3V3' }, { part: k.id, pin: 'b' });
            connect(p, { part: 'pico1', pin: 'GND' }, { part: k.id, pin: 'a' });
            connect(p, { part: k.id, pin: 'w' }, { part: 'pico1', pin: 'GP26' });
            connect(p, { part: 'pico1', pin: 'GP15' }, { part: r.id, pin: 'a' });
            connect(p, { part: r.id, pin: 'b' }, { part: led.id, pin: 'a' });
            connect(p, { part: led.id, pin: 'k' }, { part: 'pico1', pin: 'GND2' });
            return p;
        },
    },
    {
        id: 'pi_blink', title: 'Blink (Raspberry Pi)', blurb: 'The same LED, driven by Python with gpiozero on a Raspberry Pi.',
        build() {
            const p = piProject('Blink (Pi)', PI_BLINK);
            const r = addPart(p, 'resistor', 24, 6), led = addPart(p, 'led', 32, 10);
            connect(p, { part: 'pi1', pin: 'GPIO17' }, { part: r.id, pin: 'a' });
            connect(p, { part: r.id, pin: 'b' }, { part: led.id, pin: 'a' });
            connect(p, { part: led.id, pin: 'k' }, { part: 'pi1', pin: 'GND' });
            return p;
        },
    },
    {
        id: 'pi_button', title: 'Button (Raspberry Pi)', blurb: 'gpiozero\u2019s Button with when_pressed callbacks and the Pi\u2019s pull-up.',
        build() {
            const p = piProject('Button (Pi)', PI_BUTTON);
            const b = addPart(p, 'button', 24, 18), r = addPart(p, 'resistor', 24, 6), led = addPart(p, 'led', 32, 10);
            connect(p, { part: 'pi1', pin: 'GPIO4' }, { part: b.id, pin: 'a' });
            connect(p, { part: b.id, pin: 'b' }, { part: 'pi1', pin: 'GND2' });
            connect(p, { part: 'pi1', pin: 'GPIO17' }, { part: r.id, pin: 'a' });
            connect(p, { part: r.id, pin: 'b' }, { part: led.id, pin: 'a' });
            connect(p, { part: led.id, pin: 'k' }, { part: 'pi1', pin: 'GND' });
            return p;
        },
    },
    {
        id: 'pi_temperature', title: 'Temperature (Raspberry Pi, I²C)', blurb: 'smbus2 reads a TMP102 on GPIO2/GPIO3, the Pi\u2019s I²C bus 1.',
        build() {
            const p = piProject('Temperature (Pi)', PI_TEMPERATURE);
            const t = addPart(p, 'tmp102', 26, 6);
            connect(p, { part: 'pi1', pin: 'GPIO2' }, { part: t.id, pin: 'SDA' });
            connect(p, { part: 'pi1', pin: 'GPIO3' }, { part: t.id, pin: 'SCL' });
            connect(p, { part: 'pi1', pin: '3V3' }, { part: t.id, pin: 'VCC' });
            connect(p, { part: 'pi1', pin: 'GND' }, { part: t.id, pin: 'GND' });
            return p;
        },
    },
    {
        id: 'pi_knob', title: 'Knob through an ADC (Raspberry Pi)', blurb: 'An ADS1115 gives the Pi an analog input: a knob on A0 sets an LED\u2019s brightness.',
        build() {
            const p = piProject('Knob (Pi)', PI_KNOB);
            const a = addPart(p, 'ads1115', 26, 4), k = addPart(p, 'potentiometer', 38, 4), r = addPart(p, 'resistor', 26, 16), led = addPart(p, 'led', 34, 18);
            connect(p, { part: 'pi1', pin: 'GPIO2' }, { part: a.id, pin: 'SDA' });
            connect(p, { part: 'pi1', pin: 'GPIO3' }, { part: a.id, pin: 'SCL' });
            connect(p, { part: 'pi1', pin: '3V3' }, { part: a.id, pin: 'VDD' });
            connect(p, { part: 'pi1', pin: 'GND' }, { part: a.id, pin: 'GND' });
            connect(p, { part: 'pi1', pin: '3V3' }, { part: k.id, pin: 'b' });
            connect(p, { part: 'pi1', pin: 'GND' }, { part: k.id, pin: 'a' });
            connect(p, { part: k.id, pin: 'w' }, { part: a.id, pin: 'A0' });
            connect(p, { part: 'pi1', pin: 'GPIO17' }, { part: r.id, pin: 'a' });
            connect(p, { part: r.id, pin: 'b' }, { part: led.id, pin: 'a' });
            connect(p, { part: led.id, pin: 'k' }, { part: 'pi1', pin: 'GND2' });
            return p;
        },
    },
    {
        id: 'pi_motor', title: 'Motor and driver (Raspberry Pi)', blurb: 'gpiozero\u2019s Motor drives a gear motor through a TB6612, a battery for the motor.',
        build() {
            const p = piProject('Motor (Pi)', PI_MOTOR);
            const d = addPart(p, 'tb6612', 24, 4), m = addPart(p, 'motor', 38, 6), b = addPart(p, 'battery', 38, 16);
            b.props.volts = 6;
            for (const [from, to] of [['GPIO17', 'AIN1'], ['GPIO27', 'AIN2'], ['GPIO18', 'PWMA'], ['3V3', 'VCC'], ['3V3', 'STBY'], ['GND', 'GND']] as const) connect(p, { part: 'pi1', pin: from }, { part: d.id, pin: to });
            connect(p, { part: d.id, pin: 'AO1' }, { part: m.id, pin: '+' });
            connect(p, { part: d.id, pin: 'AO2' }, { part: m.id, pin: '-' });
            connect(p, { part: b.id, pin: '+' }, { part: d.id, pin: 'VM' });
            connect(p, { part: b.id, pin: '-' }, { part: 'pi1', pin: 'GND2' });
            return p;
        },
    },
    {
        id: 'pi_servo', title: 'Servo sweep (Raspberry Pi)', blurb: 'AngularServo on GPIO18: software PWM at 50 Hz from Python.',
        build() {
            const p = piProject('Servo sweep (Pi)', PI_SERVO);
            const s = addPart(p, 'servo', 26, 8);
            connect(p, { part: 'pi1', pin: 'GPIO18' }, { part: s.id, pin: 'sig' });
            connect(p, { part: 'pi1', pin: '5V' }, { part: s.id, pin: 'v' });
            connect(p, { part: 'pi1', pin: 'GND' }, { part: s.id, pin: 'gnd' });
            return p;
        },
    },
);

export function template(id: string): Template | undefined { return TEMPLATES.find(t => t.id === id); }
