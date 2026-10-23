import { describe, expect, it } from 'vitest';
import { BACKPACK, LcdBackpack, Ssd1306, lcdChar, oledPixel, type LcdScreen } from '../src/sim/displays';
import { Bench } from '../src/sim/bench';
import { template } from '../src/templates';

/** What a sketch does to a backpack: each nibble with EN high then low, the backlight on */
function driver(lcd: LcdBackpack) {
    const nibble = (bits: number, rs: boolean) => {
        const data = (bits & 0xf0) | BACKPACK.backlight | (rs ? BACKPACK.rs : 0);
        lcd.write(data | BACKPACK.en);
        lcd.write(data);
    };
    const send = (byte: number, rs = false) => { nibble(byte, rs); nibble(byte << 4, rs); };
    const start = () => { for (let i = 0; i < 3; i++) nibble(0x30, false); nibble(0x20, false); send(0x28); send(0x0c); send(0x06); send(0x01); };
    const print = (text: string) => { for (const ch of text) send(ch.charCodeAt(0), true); };
    return { nibble, send, start, print };
}

const row = (s: LcdScreen, r: number) => s.cells.slice(r * s.cols, (r + 1) * s.cols).map(c => lcdChar(c) ?? `[${c}]`).join('');

describe('the character LCD (HD44780 behind a PCF8574)', () => {
    it('starts in 8-bit mode, switches to 4-bit, and shows text where the address counter puts it', () => {
        const lcd = new LcdBackpack(0x27, 16, 2), d = driver(lcd);
        expect(lcd.screen.on).toBe(false);
        d.start();
        d.print('Hello');
        d.send(0x80 | 0x40);                       // row 2
        d.print('world');
        const s = lcd.screen;
        expect(s.on).toBe(true);
        expect(s.backlight).toBe(true);
        expect(row(s, 0)).toBe('Hello           ');
        expect(row(s, 1)).toBe('world           ');
        expect(s.cursor).toBe(-1);                  // no cursor asked for
        d.send(0x0f);                               // cursor and blink on
        expect(lcd.screen.cursor).toBe(16 + 5);
        expect(lcd.screen.blink).toBe(true);
        d.send(0x01);                               // clear
        expect(row(lcd.screen, 0).trim()).toBe('');
        lcd.write(0x00);                            // backlight off (P3 low)
        expect(lcd.screen.backlight).toBe(false);
    });

    it('stores custom characters in CGRAM, shifts the display, and folds a 20×4 into two lines', () => {
        const lcd = new LcdBackpack(0x27, 16, 2), d = driver(lcd);
        d.start();
        d.send(0x40 | 8);                           // CGRAM, character 1
        for (const bits of [1, 2, 3, 4, 5, 6, 7, 8]) d.send(bits, true);
        d.send(0x80);
        d.send(1, true);
        expect(lcd.screen.cgram.slice(8, 16)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(lcd.screen.cells[0]).toBe(1);
        d.print('AB');
        d.send(0x18);                               // shift the display left
        expect(row(lcd.screen, 0).slice(0, 2)).toBe('AB');
        const big = new LcdBackpack(0x3f, 20, 4), b = driver(big);
        b.start();
        b.send(0x80 | 0x14);                        // row 3 starts right after row 1's 20 cells
        b.print('third');
        b.send(0x80 | 0x54);
        b.print('fourth');
        expect(row(big.screen, 2).trim()).toBe('third');
        expect(row(big.screen, 3).trim()).toBe('fourth');
    });

    it('reads the A00 character ROM: ASCII, the yen sign, arrows, katakana', () => {
        expect(lcdChar(0x41)).toBe('A');
        expect(lcdChar(0x5c)).toBe('¥');
        expect(lcdChar(0x7e)).toBe('→');
        expect(lcdChar(0xb1)).toBe('ｱ');
        expect(lcdChar(0xdf)).toBe('°');
        expect(lcdChar(3)).toBeNull();
    });
});

/** Adafruit_SSD1306's start-up, then a full-screen write in horizontal mode */
function oledStart(oled: Ssd1306, height = 64) {
    const cmds = [0xae, 0xd5, 0x80, 0xa8, height - 1, 0xd3, 0, 0x40, 0x8d, 0x14, 0x20, 0, 0xa1, 0xc8, 0xda, height === 64 ? 0x12 : 0x02, 0x81, 0xcf, 0xd9, 0xf1, 0xdb, 0x40, 0xa4, 0xa6, 0x2e, 0xaf];
    oled.begin(); oled.write(0x00); for (const c of cmds) oled.write(c); oled.end();
}
function oledData(oled: Ssd1306, bytes: number[]) {
    oled.begin(); for (const c of [0x00, 0x21, 0, 127, 0x22, 0, 7]) oled.write(c); oled.end();
    for (let i = 0; i < bytes.length; i += 31) { oled.begin(); oled.write(0x40); for (const b of bytes.slice(i, i + 31)) oled.write(b); oled.end(); }
}

describe('the OLED (SSD1306)', () => {
    it('stays dark until it is on with its charge pump; data lands in pages, bit 0 at the top', () => {
        const oled = new Ssd1306(0x3c);
        expect(oled.screen.on).toBe(false);
        oledStart(oled);
        expect(oled.screen.on).toBe(true);
        const ram = new Array(1024).fill(0);
        ram[0] = 0x01;                              // top-left pixel
        ram[127 + 7 * 128] = 0x80;                  // bottom-right pixel
        ram[5 + 2 * 128] = 0xff;                    // a column of eight in page 2
        oledData(oled, ram);
        const s = oled.screen;
        expect(oledPixel(s, 0, 0)).toBe(true);
        expect(oledPixel(s, 127, 63)).toBe(true);
        for (let y = 16; y < 24; y++) expect(oledPixel(s, 5, y)).toBe(true);
        expect(oledPixel(s, 1, 0)).toBe(false);
        expect(s.pixels.reduce((n, b) => n + b.toString(2).replace(/0/g, '').length, 0)).toBe(10);
    });

    it('page addressing, single-command control bytes, inverting, the whole display on, and off again', () => {
        const oled = new Ssd1306(0x3c);
        oledStart(oled);
        oled.begin(); for (const c of [0x80, 0x20, 0x80, 0x02, 0x80, 0xb3, 0x80, 0x04, 0x80, 0x10]) oled.write(c); oled.end();   // page mode, page 3, column 4
        oled.begin(); oled.write(0xc0); oled.write(0xff); oled.end();                                                              // one data byte
        expect(oledPixel(oled.screen, 4, 24)).toBe(true);
        expect(oledPixel(oled.screen, 4, 31)).toBe(true);
        oled.begin(); oled.write(0x80); oled.write(0xa7); oled.end();
        expect(oledPixel(oled.screen, 0, 0)).toBe(true);
        expect(oledPixel(oled.screen, 4, 24)).toBe(false);
        oled.begin(); oled.write(0x00); oled.write(0xa6); oled.write(0xa5); oled.end();
        expect(oled.screen.pixels.every(b => b === 0xff)).toBe(true);
        oled.begin(); oled.write(0x00); oled.write(0xae); oled.end();
        expect(oled.screen.on).toBe(false);
        expect(oled.screen.pixels.every(b => b === 0)).toBe(true);
    });

    it('a 128×32 shows four pages', () => {
        const oled = new Ssd1306(0x3c, 128, 32);
        oledStart(oled, 32);
        const ram = new Array(512).fill(0);
        ram[3 * 128] = 0x80;                        // row 31
        oledData(oled, ram);
        expect(oled.screen.pixels.length).toBe(16 * 32);
        expect(oledPixel(oled.screen, 0, 31)).toBe(true);
    });
});

describe('the screen templates on an Uno', () => {
    it('Character LCD: LiquidCrystal_I2C prints the greeting, makes the heart, and shows the knob', () => {
        const project = template('lcd_hello')!.build();
        const bench = new Bench(project);
        bench.run(1.5);
        const s = bench.state('lcd1').screen as LcdScreen;
        expect(s.on && s.backlight).toBe(true);
        expect(row(s, 0)).toBe('Hello, Bot Lab [0]');
        expect(s.cgram.slice(0, 8)).toEqual([0b00000, 0b01010, 0b11111, 0b11111, 0b11111, 0b01110, 0b00100, 0b00000]);
        expect(row(s, 1).slice(0, 5)).toMatch(/^51[12] {2}$/);
        expect(s.cells.slice(16 + 5, 16 + 16).filter(c => c === 1).length).toBe(5);   // half the knob: 5 of 11 bars
        bench.setProp('potentiometer1', 'position', 0.999);
        bench.run(0.3);
        expect(row(bench.state('lcd1').screen as LcdScreen, 1).slice(0, 4)).toMatch(/^102[23]$/);
    }, 60_000);

    it('OLED graphics: Adafruit_SSD1306 starts the panel and draws the title, the box and the knob bar', () => {
        const project = template('oled_graphics')!.build();
        const bench = new Bench(project);
        bench.run(1);
        expect(bench.board!.serial).toContain('OLED ready');
        const s = bench.state('oled1').screen!;
        if (s.kind !== 'oled') throw new Error('not an OLED');
        expect(s.on).toBe(true);
        const lit = (y: number) => Array.from({ length: 128 }, (_, x) => oledPixel(s, x, y)).filter(Boolean).length;
        expect(lit(12)).toBe(128);                  // the box's top edge
        expect(lit(60)).toBeGreaterThan(58);        // the knob at half: a bar about 64 px long
        expect(lit(60)).toBeLessThan(70);
        expect(Array.from({ length: 8 }, (_, y) => lit(y)).reduce((a, b) => a + b)).toBeGreaterThan(60);   // the title
    }, 60_000);

    it('7-segment counter: the digit shows 0, then 1, through each segment’s resistor', () => {
        const project = template('sevenseg_counter')!.build();
        const bench = new Bench(project);
        const lit = () => bench.state('sevenseg1').segments!.map(b => b > 0.3 ? 1 : 0).join('');
        bench.run(0.2);
        expect(lit()).toBe('11111101');             // 0 with the dot
        bench.run(0.5);
        expect(lit()).toBe('11111100');             // the dot off
        bench.run(0.5);
        expect(lit()).toBe('01100001');             // 1
        expect(bench.state('sevenseg1').segments![1]).toBeLessThan(0.9);   // 330 Ω keeps it under 20 mA
        expect(bench.warnings).toEqual([]);
    }, 60_000);

    it('an unpowered screen shows nothing', () => {
        const project = template('lcd_hello')!.build();
        project.wires = project.wires.filter(w => !(w.a.part === 'lcd1' && w.a.pin === 'VCC') && !(w.b.part === 'lcd1' && w.b.pin === 'VCC'));
        const bench = new Bench(project);
        bench.run(0.5);
        expect(bench.state('lcd1').screen).toBeUndefined();
    }, 60_000);
});
