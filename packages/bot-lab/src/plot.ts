// The Serial Plotter: lines a sketch prints, read the way the Arduino IDE's plotter reads them. A line holds values
// separated by commas, spaces or tabs; each is "name:value" or a bare number (named by its place: 1, 2, ...). Lines
// with no number on them (a heading, a message) are skipped.

export interface Plot {
    /** Each series' name, in the order first seen */
    names: string[];
    /** Per series, one value per plotted line (NaN where that line didn't have it) */
    series: number[][];
    /** Lines plotted */
    length: number;
    min: number;
    max: number;
}

/** The values on one line, or null when it has none. */
export function parsePlotLine(line: string): [string, number][] | null {
    const out: [string, number][] = [];
    let place = 0;
    for (const field of line.split(/[,\t ]+/)) {
        if (!field) continue;
        const colon = field.lastIndexOf(':');
        const name = colon > 0 ? field.slice(0, colon) : String(++place);
        const text = colon >= 0 ? field.slice(colon + 1) : field;
        if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text)) {
            if (colon < 0) return null;                  // a word: this line is a message, not data
            continue;
        }
        out.push([name, Number(text)]);
    }
    return out.length ? out : null;
}

/** The last `limit` plottable lines as series. */
export function plotLines(lines: string[], limit = 200): Plot {
    const names: string[] = [];
    const rows: Map<string, number>[] = [];
    for (const line of lines) {
        const values = parsePlotLine(line);
        if (!values) continue;
        const row = new Map<string, number>();
        for (const [name, value] of values) {
            if (!names.includes(name)) names.push(name);
            row.set(name, value);
        }
        rows.push(row);
    }
    const kept = rows.slice(-limit);
    const series = names.map(name => kept.map(row => row.get(name) ?? NaN));
    const all = series.flat().filter(Number.isFinite);
    let min = all.length ? Math.min(...all) : 0, max = all.length ? Math.max(...all) : 1;
    if (max - min < 1e-9) { min -= 1; max += 1; }
    return { names, series, length: kept.length, min, max };
}
