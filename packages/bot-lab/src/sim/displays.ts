// Screens on I²C. The character LCD is an HD44780 controller behind a PCF8574 "backpack" (the I²C board soldered to
// the back of nearly every 16×2 and 20×4 module): the PCF8574's eight outputs drive RS, RW, EN, the backlight and the
// four data lines, so a sketch talks to the HD44780 four bits at a time, latched on EN's falling edge. The OLED is an
// SSD1306 with its own I²C interface: a control byte says whether commands or pixel data follow. Both follow their
// datasheets closely enough for LiquidCrystal_I2C, Adafruit_SSD1306, MicroPython's framebuf and hand-written drivers.
import type { I2CDevice } from './i2c';

/** What a screen shows, for the bench's part state (and the app to draw) */
export type ScreenState = LcdScreen | OledScreen;

export interface LcdScreen {
    kind: 'lcd';
    cols: number;
    rows: number;
    /** Character codes, row by row (what DDRAM holds at each visible cell, display shift applied) */
    cells: number[];
    /** CGRAM: eight 5×8 custom characters, 8 rows each (low 5 bits) */
    cgram: number[];
    /** The cursor's visible cell, or -1 when hidden or off-screen; whether it blinks */
    cursor: number;
    blink: boolean;
    /** Display on (instruction 0x08 D bit) and the backlight (the backpack's P3) */
    on: boolean;
    backlight: boolean;
}

/** Whether the OLED pixel at x, y is lit */
export const oledPixel = (s: OledScreen, x: number, y: number) => ((s.pixels[y * (s.width >> 3) + (x >> 3)] >> (7 - (x & 7))) & 1) === 1;

export interface OledScreen {
    kind: 'oled';
    width: number;
    height: number;
    /** The picture as it appears (orientation applied): rows top to bottom, each width/8 bytes, leftmost pixel in bit 7 */
    pixels: number[];
    on: boolean;
    /** 0..255 */
    contrast: number;
}

// ---------------------------------------------------------------------------------------------------------------------
// The HD44780

/** DDRAM addresses of each row's first cell, by the module's size */
const ROW_START = { 2: [0x00, 0x40], 4: [0x00, 0x40, 0x14, 0x54] } as const;

export class Hd44780 {
    readonly ddram = new Array<number>(0x80).fill(0x20);
    readonly cgram = new Array<number>(64).fill(0);
    private address = 0;            // the address counter
    private toCgram = false;        // the last address set was CGRAM's
    private increment = true;
    private shiftOnWrite = false;
    private shift = 0;              // display shift, cells
    private fourBit = false;        // powers up in 8-bit mode
    private half: number | null = null;   // 4-bit mode: the high nibble waiting for its low one
    on = false;
    cursorOn = false;
    blink = false;
    twoLines = false;

    constructor(readonly cols: number, readonly rows: 2 | 4) {}

    /** EN fell: the bus's data lines (D7–D4, as the high nibble of `nibble`) are latched, with RS. */
    latch(rs: boolean, nibble: number) {
        if (!this.fourBit) { this.execute(rs, nibble & 0xf0); return; }   // 8-bit mode: D3–D0 aren't wired, read as 0
        if (this.half === null) { this.half = nibble & 0xf0; return; }
        const byte = this.half | (nibble >> 4);
        this.half = null;
        this.execute(rs, byte);
    }

    private execute(rs: boolean, byte: number) {
        if (rs) { this.data(byte); return; }
        if (byte & 0x80) { this.address = byte & 0x7f; this.toCgram = false; }
        else if (byte & 0x40) { this.address = byte & 0x3f; this.toCgram = true; }
        else if (byte & 0x20) {
            this.fourBit = !(byte & 0x10);
            this.twoLines = !!(byte & 0x08);
            this.half = null;
        } else if (byte & 0x10) {
            const display = !!(byte & 0x08), right = !!(byte & 0x04);
            if (display) this.shift += right ? 1 : -1;
            else this.address = (this.address + (right ? 1 : -1)) & 0x7f;
        } else if (byte & 0x08) { this.on = !!(byte & 0x04); this.cursorOn = !!(byte & 0x02); this.blink = !!(byte & 0x01); }
        else if (byte & 0x04) { this.increment = !!(byte & 0x02); this.shiftOnWrite = !!(byte & 0x01); }
        else if (byte & 0x02) { this.address = 0; this.shift = 0; this.toCgram = false; }
        else if (byte & 0x01) { this.ddram.fill(0x20); this.address = 0; this.shift = 0; this.increment = true; this.toCgram = false; }
    }

    private data(byte: number) {
        if (this.toCgram) { this.cgram[this.address & 0x3f] = byte & 0x1f; this.address = (this.address + (this.increment ? 1 : -1)) & 0x3f; return; }
        this.ddram[this.address & 0x7f] = byte;
        this.address = (this.address + (this.increment ? 1 : -1)) & 0x7f;
        if (this.shiftOnWrite) this.shift += this.increment ? -1 : 1;
    }

    /** The visible cells: each row shows 40 DDRAM cells (two-line mode) through a window moved by the display shift */
    view(backlight: boolean): LcdScreen {
        const cells: number[] = [];
        let cursor = -1;
        const starts = ROW_START[this.rows];
        for (let r = 0; r < this.rows; r++) {
            // 20×4 modules are two 40-cell lines folded: rows 0 and 2 share line 1, rows 1 and 3 line 2
            const line = starts[r] & 0x40, offset = (starts[r] & 0x3f);
            for (let c = 0; c < this.cols; c++) {
                const at = line | (((offset + c - this.shift) % 40 + 40) % 40);
                cells.push(this.ddram[at]);
                if (!this.toCgram && this.address === at && (this.cursorOn || this.blink)) cursor = r * this.cols + c;
            }
        }
        return { kind: 'lcd', cols: this.cols, rows: this.rows, cells, cgram: [...this.cgram], cursor, blink: this.blink, on: this.on, backlight };
    }
}

/** The backpack's wiring of PCF8574 outputs: P0 RS, P1 RW, P2 EN, P3 backlight, P4–P7 D4–D7 */
export const BACKPACK = { rs: 0x01, rw: 0x02, en: 0x04, backlight: 0x08 } as const;

/** A character LCD with an I²C backpack (PCF8574 at 0x27, or 0x3F on the PCF8574A version) */
export class LcdBackpack implements I2CDevice {
    readonly lcd: Hd44780;
    private port = 0xff;            // the PCF8574's outputs power up high
    private cached: LcdScreen | null = null;
    constructor(readonly address: number, cols: number, rows: 2 | 4) { this.lcd = new Hd44780(cols, rows); }
    begin() {}
    write(byte: number): boolean {
        const before = this.port;
        this.port = byte & 0xff;
        if ((before & BACKPACK.en) && !(byte & BACKPACK.en) && !(byte & BACKPACK.rw)) this.lcd.latch(!!(byte & BACKPACK.rs), byte & 0xf0);
        this.cached = null;
        return true;
    }
    /** Reading a PCF8574 returns its pins: the outputs as last written */
    read(): number { return this.port; }
    end() {}
    get screen(): LcdScreen { return this.cached ??= this.lcd.view(!!(this.port & BACKPACK.backlight)); }
}

/**
 * The HD44780's character ROM (the common A00 version) as text: ASCII for most of 0x20–0x7D, ¥ for the backslash,
 * arrows at 0x7E/0x7F, half-width katakana at 0xA1–0xDE, a degree sign at 0xDF and some Greek and maths above. Codes 0–15 are the custom
 * characters (null here: draw them from CGRAM).
 */
export function lcdChar(code: number): string | null {
    if (code < 16) return null;
    if (code < 0x20) return ' ';
    if (code === 0x5c) return '¥';
    if (code === 0x7e) return '→';
    if (code === 0x7f) return '←';
    if (code < 0x80) return String.fromCharCode(code);
    if (code >= 0xa1 && code <= 0xde) return String.fromCharCode(0xff61 + code - 0xa1);   // 0xDF, the handakuten, is everyone's degree sign
    const high: Record<number, string> = { 0xe0: 'α', 0xe1: 'ä', 0xe2: 'β', 0xe3: 'ε', 0xe4: 'µ', 0xe5: 'σ', 0xe6: 'ρ', 0xe8: '√', 0xeb: '×', 0xec: '¢', 0xee: 'ñ', 0xef: 'ö', 0xf2: 'θ', 0xf3: '∞', 0xf4: 'Ω', 0xf5: 'ü', 0xf6: 'Σ', 0xf7: 'π', 0xfd: '÷', 0xff: '█', 0xdf: '°' };
    return high[code] ?? ' ';
}

// ---------------------------------------------------------------------------------------------------------------------
// The SSD1306

/** Argument bytes each command takes (the rest take none) */
const ARGS: Record<number, number> = { 0x81: 1, 0x20: 1, 0x21: 2, 0x22: 2, 0xa8: 1, 0xd3: 1, 0xda: 1, 0xd5: 1, 0xd9: 1, 0xdb: 1, 0x8d: 1, 0x26: 6, 0x27: 6, 0x29: 5, 0x2a: 5, 0xa3: 2 };

export class Ssd1306 implements I2CDevice {
    /** GDDRAM: 8 pages × 128 columns; bit n of a byte is row page·8 + n */
    readonly ram = new Uint8Array(8 * 128);
    on = false;
    contrast = 0x7f;
    private invert = false;
    private allOn = false;
    private chargePump = false;
    private mode = 2;                // 0 horizontal, 1 vertical, 2 page addressing (the reset default)
    private col = 0;
    private page = 0;
    private colStart = 0;
    private colEnd = 127;
    private pageStart = 0;
    private pageEnd = 7;
    private startLine = 0;
    private remap = false;           // segment remap (0xA1)
    private comFlip = false;         // COM scan direction (0xC8)
    private multiplex = 63;
    // the I²C framing: after the address, a control byte (Co, D/C), then commands or data
    private expectControl = true;
    private dataMode = false;
    private continuation = false;    // Co = 0: everything after is the same kind
    private pending: number[] = [];  // a command waiting for its arguments
    private cached: OledScreen | null = null;

    constructor(readonly address: number, readonly width = 128, readonly height: 32 | 64 = 64) {}

    begin() { this.expectControl = true; this.continuation = false; }

    write(byte: number): boolean {
        this.cached = null;
        if (this.expectControl) {
            this.dataMode = !!(byte & 0x40);
            this.continuation = !(byte & 0x80);
            this.expectControl = false;
            return true;
        }
        if (this.dataMode) this.data(byte); else this.command(byte);
        if (!this.continuation) this.expectControl = true;    // Co = 1: one byte, then another control byte
        return true;
    }

    read(): number { return (this.on ? 0 : 0x40); }          // the status byte: bit 6 says the display is off

    end() { this.expectControl = true; }

    private command(byte: number) {
        if (this.pending.length) {
            this.pending.push(byte);
            if (this.pending.length - 1 < ARGS[this.pending[0]]) return;
            const [cmd, ...args] = this.pending;
            this.pending = [];
            this.withArgs(cmd, args);
            return;
        }
        if (ARGS[byte]) { this.pending = [byte]; return; }
        if (byte === 0xae || byte === 0xaf) this.on = byte === 0xaf;
        else if (byte === 0xa4 || byte === 0xa5) this.allOn = byte === 0xa5;
        else if (byte === 0xa6 || byte === 0xa7) this.invert = byte === 0xa7;
        else if (byte === 0xa0 || byte === 0xa1) this.remap = byte === 0xa1;
        else if (byte === 0xc0 || byte === 0xc8) this.comFlip = byte === 0xc8;
        else if (byte >= 0x40 && byte <= 0x7f) this.startLine = byte & 0x3f;
        else if (byte >= 0xb0 && byte <= 0xb7) this.page = byte & 7;
        else if (byte <= 0x0f) this.col = (this.col & 0xf0) | byte;
        else if (byte >= 0x10 && byte <= 0x1f) this.col = ((byte & 0x0f) << 4) | (this.col & 0x0f);
        // scrolling (0x2E/0x2F) and the rest don't change what's drawn here
    }

    private withArgs(cmd: number, args: number[]) {
        switch (cmd) {
            case 0x81: this.contrast = args[0]; break;
            case 0x20: this.mode = args[0] & 3; if (this.mode === 3) this.mode = 2; break;
            case 0x21: this.colStart = args[0] & 0x7f; this.colEnd = args[1] & 0x7f; this.col = this.colStart; break;
            case 0x22: this.pageStart = args[0] & 7; this.pageEnd = args[1] & 7; this.page = this.pageStart; break;
            case 0x8d: this.chargePump = !!(args[0] & 0x04); break;
            case 0xa8: this.multiplex = args[0] & 0x3f; break;
        }
    }

    private data(byte: number) {
        this.ram[this.page * 128 + this.col] = byte;
        if (this.mode === 2) { this.col = this.col >= 127 ? 0 : this.col + 1; return; }
        if (this.mode === 0) {
            if (this.col < this.colEnd) { this.col++; return; }
            this.col = this.colStart;
            this.page = this.page < this.pageEnd ? this.page + 1 : this.pageStart;
            return;
        }
        if (this.page < this.pageEnd) { this.page++; return; }
        this.page = this.pageStart;
        this.col = this.col < this.colEnd ? this.col + 1 : this.colStart;
    }

    /** Lit when it's on and its charge pump makes the panel's voltage (without 0x8D 0x14 a real module stays dark) */
    get lit() { return this.on && this.chargePump; }

    get screen(): OledScreen {
        if (this.cached) return this.cached;
        const { width, height } = this, stride = width >> 3, pixels = new Array<number>(stride * height).fill(0);
        const rows = Math.min(height, this.multiplex + 1);
        if (this.lit) {
            for (let y = 0; y < rows; y++) {
                // every library sends 0xA1 and 0xC8 for an upright picture on these modules, so that's "as written"
                const com = this.comFlip ? y : rows - 1 - y;
                const row = (com + this.startLine) & 63;
                for (let x = 0; x < width; x++) {
                    const col = this.remap ? x : 127 - x;
                    const bit = (this.ram[(row >> 3) * 128 + col] >> (row & 7)) & 1;
                    if (this.allOn || (bit ^ (this.invert ? 1 : 0))) pixels[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
                }
            }
        }
        return this.cached = { kind: 'oled', width, height, pixels, on: this.lit, contrast: this.contrast };
    }
}
