// Intel HEX (what arduino-cli produces) into flash bytes. Record types: 00 data, 01 end of file; the extended
// address records (02, 04) never appear for a 32 KB AVR, so anything else is refused.

export function parseHex(text: string, flashSize = 0x8000): Uint8Array {
    const flash = new Uint8Array(flashSize);
    let highest = -1;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        if (line[0] !== ':') throw new Error(`not Intel HEX: ${line.slice(0, 20)}`);
        const bytes = new Uint8Array(line.length / 2 | 0);
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(line.slice(1 + i * 2, 3 + i * 2), 16);
        const count = bytes[0], address = (bytes[1] << 8) | bytes[2], type = bytes[3];
        if (bytes.length !== count + 5) throw new Error(`bad record length: ${line.slice(0, 20)}`);
        const sum = bytes.reduce((a, b) => (a + b) & 0xff, 0);
        if (sum !== 0) throw new Error(`bad checksum: ${line.slice(0, 20)}`);
        if (type === 1) break;
        if (type !== 0) throw new Error(`unsupported record type ${type}`);
        if (address + count > flashSize) throw new Error(`program doesn't fit in ${flashSize} bytes of flash`);
        flash.set(bytes.subarray(4, 4 + count), address);
        highest = Math.max(highest, address + count);
    }
    if (highest < 0) throw new Error('empty program');
    return flash;
}
