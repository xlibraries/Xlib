// The RP2040 boot ROM's floating-point routines, in JavaScript. The ROM's float library (Mark Owen's, licensed for use
// only on a real RP2040 or under the GPL) isn't shipped: firmware/rp2040-bootrom-b1-nofp.bin has those bytes zeroed,
// and when the emulated core jumps to one of its entry points this module does the arithmetic and returns, as the
// routine would. Entry addresses come from the B1 boot ROM's symbol table; the calling conventions are the RP2040
// datasheet's (section 2.8.3): floats in r0/r1, doubles and 64-bit integers in register pairs (low word first),
// float→integer conversions round towards −∞ and clamp. JS maths is correctly rounded for + − × ÷ √ and more accurate
// than the ROM's CORDIC for trigonometry, so results match or beat the real chip's.

/** The library's address range in the B1 boot ROM */
export const ROM_FLOAT_START = 0x2758;
export const ROM_FLOAT_END = 0x3dac;
const CYCLES = 40;   // about what a ROM float call costs on the chip

export interface RomFloatCore {
    readonly registers: Uint32Array;
    N: boolean;
    Z: boolean;
    C: boolean;
    V: boolean;
    PC: number;
    readonly LR: number;
}

const buf = new DataView(new ArrayBuffer(8));
const f32 = (bits: number) => { buf.setUint32(0, bits >>> 0, true); return buf.getFloat32(0, true); };
const bitsF32 = (v: number) => { buf.setFloat32(0, v, true); return buf.getUint32(0, true); };
const f64 = (lo: number, hi: number) => { buf.setUint32(0, lo >>> 0, true); buf.setUint32(4, hi >>> 0, true); return buf.getFloat64(0, true); };
const bitsF64 = (v: number): [number, number] => { buf.setFloat64(0, v, true); return [buf.getUint32(0, true), buf.getUint32(4, true)]; };
// BigInt() calls rather than BigInt literals: the site compiles to a target before ES2020
const N1 = BigInt(1), N32 = BigInt(32), N63 = BigInt(63);
const i64 = (lo: number, hi: number) => (BigInt(hi | 0) << N32) | BigInt(lo >>> 0);
const u64 = (lo: number, hi: number) => (BigInt(hi >>> 0) << N32) | BigInt(lo >>> 0);
const pair = (v: bigint): [number, number] => [Number(BigInt.asUintN(32, v)), Number(BigInt.asUintN(32, v >> N32))];
const pow2 = (n: number) => Math.pow(2, n | 0);

/** floor, then clamp to a signed or unsigned 32-bit range */
const toInt32 = (v: number) => Number.isNaN(v) ? 0 : Math.max(-0x80000000, Math.min(0x7fffffff, Math.floor(v))) >>> 0;
const toUint32 = (v: number) => Number.isNaN(v) ? 0 : Math.max(0, Math.min(0xffffffff, Math.floor(v))) >>> 0;
const toInt64 = (v: number): [number, number] => {
    if (Number.isNaN(v)) return [0, 0];
    if (v >= 2 ** 63) return pair((N1 << N63) - N1);
    if (v < -(2 ** 63)) return pair(-(N1 << N63));
    return pair(BigInt(Math.floor(v)));
};
const toUint64 = (v: number): [number, number] => {
    if (Number.isNaN(v) || v <= 0) return [0, 0];
    if (v >= 2 ** 64) return [0xffffffff, 0xffffffff];
    return pair(BigInt(Math.floor(v)));
};

type Handler = (r: Uint32Array, core: RomFloatCore) => void;

const unaryF = (fn: (a: number) => number): Handler => r => { r[0] = bitsF32(Math.fround(fn(f32(r[0])))); };
const binaryF = (fn: (a: number, b: number) => number): Handler => r => { r[0] = bitsF32(Math.fround(fn(f32(r[0]), f32(r[1])))); };
const retD = (r: Uint32Array, v: number) => { const [lo, hi] = bitsF64(v); r[0] = lo; r[1] = hi; };
const unaryD = (fn: (a: number) => number): Handler => r => retD(r, fn(f64(r[0], r[1])));
const binaryD = (fn: (a: number, b: number) => number): Handler => r => retD(r, fn(f64(r[0], r[1]), f64(r[2], r[3])));
const ret64 = (r: Uint32Array, [lo, hi]: [number, number]) => { r[0] = lo; r[1] = hi; };

/** Compare as CMP would: flags for a − b (unordered: NZCV = 0011), and −1/0/1 in r0. */
const compare = (a: number, b: number, r: Uint32Array, core: RomFloatCore) => {
    if (Number.isNaN(a) || Number.isNaN(b)) { core.N = false; core.Z = false; core.C = true; core.V = true; r[0] = 1; return; }
    core.N = a < b; core.Z = a === b; core.C = a >= b; core.V = false;
    r[0] = (a < b ? -1 : a > b ? 1 : 0) >>> 0;
};

/** Entry point (even address) → what it does */
const ENTRIES: Record<number, Handler> = {
    // single precision
    0x2b68: binaryF((a, b) => a + b),                                   // fadd
    0x2b64: binaryF((a, b) => a - b),                                   // fsub
    0x2c30: binaryF((a, b) => a * b),                                   // fmul
    0x2cfc: binaryF((a, b) => a / b),                                   // fdiv
    0x2db0: unaryF(Math.sqrt),                                          // fsqrt
    0x2974: unaryF(Math.sin),                                           // fsin
    0x29be: unaryF(Math.cos),                                           // fcos
    0x29dc: unaryF(Math.tan),                                           // ftan
    0x29e4: unaryF(Math.exp),                                           // fexp
    0x2a4e: unaryF(Math.log),                                           // fln
    0x2a72: binaryF((y, x) => Math.atan2(y, x)),                        // fatan2(y, x)
    0x280a: (r, c) => compare(f32(r[0]), f32(r[1]), r, c),              // fcmp
    0x2826: (r, c) => compare(f32(r[0]), f32(r[1]), r, c),              // fcmp_fast_flags
    0x284c: r => { r[0] = toInt32(f32(r[0])); },                        // float2int
    0x284e: r => { r[0] = toInt32(f32(r[0]) * pow2(r[1])); },           // float2fix(a, n)
    0x2880: r => { r[0] = toUint32(f32(r[0])); },                       // float2uint
    0x2882: r => { r[0] = toUint32(f32(r[0]) * pow2(r[1])); },          // float2ufix(a, n)
    0x28d6: r => { r[0] = bitsF32(Math.fround(r[0] | 0)); },            // int2float
    0x28d8: r => { r[0] = bitsF32(Math.fround((r[0] | 0) / pow2(r[1]))); },    // fix2float(m, n)
    0x28e6: r => { r[0] = bitsF32(Math.fround(r[0] >>> 0)); },          // uint2float
    0x28e8: r => { r[0] = bitsF32(Math.fround((r[0] >>> 0) / pow2(r[1]))); },  // ufix2float(m, n)
    0x28ae: r => { r[0] = bitsF32(Math.fround(Number(i64(r[0], r[1])))); },    // int642float
    0x28b0: r => { r[0] = bitsF32(Math.fround(Number(i64(r[0], r[1])) / pow2(r[2]))); },   // fix642float(m, n)
    0x289c: r => { r[0] = bitsF32(Math.fround(Number(u64(r[0], r[1])))); },    // uint642float
    0x289e: r => { r[0] = bitsF32(Math.fround(Number(u64(r[0], r[1])) / pow2(r[2]))); },   // ufix642float(m, n)
    0x3580: r => ret64(r, toInt64(f32(r[0]))),                          // float2int64
    0x3582: r => ret64(r, toInt64(f32(r[0]) * pow2(r[1]))),             // float2fix64(a, n)
    0x358a: r => ret64(r, toUint64(f32(r[0]))),                         // float2uint64
    0x358c: r => ret64(r, toUint64(f32(r[0]) * pow2(r[1]))),            // float2ufix64(a, n)
    0x363c: r => retD(r, f32(r[0])),                                    // float2double
    // double precision
    0x2e60: binaryD((a, b) => a + b),                                   // dadd
    0x2e54: binaryD((a, b) => a - b),                                   // dsub
    0x2fbc: binaryD((a, b) => a * b),                                   // dmul
    0x3118: binaryD((a, b) => a / b),                                   // ddiv
    0x32dc: unaryD(Math.sqrt),                                          // dsqrt
    0x3840: unaryD(Math.sin),                                           // dsin
    0x3830: unaryD(Math.cos),                                           // dcos
    0x3810: unaryD(Math.tan),                                           // dtan
    0x3b44: unaryD(Math.exp),                                           // dexp
    0x3be0: unaryD(Math.log),                                           // dln
    0x3930: binaryD((y, x) => Math.atan2(y, x)),                        // datan2(y, x)
    0x346e: (r, c) => compare(f64(r[0], r[1]), f64(r[2], r[3]), r, c),  // dcmp
    0x346a: (r, c) => compare(f64(r[0], r[1]), f64(r[2], r[3]), r, c),  // dcmp_fast_flags
    0x3564: r => { r[0] = toInt32(f64(r[0], r[1])); },                  // double2int
    0x3566: r => { r[0] = toInt32(f64(r[0], r[1]) * pow2(r[2])); },     // double2fix(a, n)
    0x3572: r => { r[0] = toUint32(f64(r[0], r[1])); },                 // double2uint
    0x3574: r => { r[0] = toUint32(f64(r[0], r[1]) * pow2(r[2])); },    // double2ufix(a, n)
    0x35c0: r => ret64(r, toInt64(f64(r[0], r[1]))),                    // double2int64
    0x35c2: r => ret64(r, toInt64(f64(r[0], r[1]) * pow2(r[2]))),       // double2fix64(a, n)
    0x35da: r => ret64(r, toUint64(f64(r[0], r[1]))),                   // double2uint64
    0x35dc: r => ret64(r, toUint64(f64(r[0], r[1]) * pow2(r[2]))),      // double2ufix64(a, n)
    0x3662: r => { r[0] = bitsF32(Math.fround(f64(r[0], r[1]))); },     // double2float
    0x36c2: r => retD(r, r[0] | 0),                                     // int2double
    0x36c4: r => retD(r, (r[0] | 0) / pow2(r[1])),                      // fix2double(m, n)
    0x36ba: r => retD(r, r[0] >>> 0),                                   // uint2double
    0x36bc: r => retD(r, (r[0] >>> 0) / pow2(r[1])),                    // ufix2double(m, n)
    0x36d0: r => retD(r, Number(i64(r[0], r[1]))),                      // int642double
    0x36d2: r => retD(r, Number(i64(r[0], r[1])) / pow2(r[2])),         // fix642double(m, n)
    0x36ca: r => retD(r, Number(u64(r[0], r[1]))),                      // uint642double
    0x36cc: r => retD(r, Number(u64(r[0], r[1])) / pow2(r[2])),         // ufix642double(m, n)
};

/** True when the core is about to run one of the missing ROM routines. */
export function inRomFloat(pc: number): boolean {
    return pc >= ROM_FLOAT_START && pc < ROM_FLOAT_END;
}

/** Runs the routine at the core's PC and returns to its caller; the cycles it took. Throws on an address that isn't
 *  an entry point (firmware jumping into the middle of the library would be a bug to look at). */
export function runRomFloat(core: RomFloatCore): number {
    const pc = core.PC & ~1;
    const handler = ENTRIES[pc];
    if (!handler) throw new Error(`the firmware called the boot ROM's float library at 0x${pc.toString(16)}, which Bot Lab doesn't stand in for`);
    handler(core.registers, core);
    core.PC = core.LR & ~1;
    return CYCLES;
}

/** The entry points (for tests) */
export const ROM_FLOAT_ENTRIES = Object.keys(ENTRIES).map(Number);
