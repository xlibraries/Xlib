// The Arcade's audio output: an AudioWorklet that plays interleaved float chunks the game posts from the main
// thread (xl_audio.h). No SharedArrayBuffer needed, so it works without cross-origin isolation. Once a second it
// reports how many frames it has played, so the game can keep its lead time steady.
class XlAudioProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.channels = (options.outputChannelCount && options.outputChannelCount[0]) || 1;
        this.queue = [];        // Float32Array chunks, interleaved
        this.offset = 0;        // frames consumed from queue[0]
        this.played = 0;        // frames output since start (silence included)
        this.lastReport = 0;
        this.port.onmessage = (e) => { if (e.data instanceof Float32Array) this.queue.push(e.data); };
    }

    process(inputs, outputs) {
        const out = outputs[0];
        const frames = out[0].length;
        let written = 0;
        while (written < frames && this.queue.length) {
            const chunk = this.queue[0];
            const available = chunk.length / this.channels - this.offset;
            const take = Math.min(available, frames - written);
            for (let ch = 0; ch < out.length; ch++) {
                const src = Math.min(ch, this.channels - 1);
                const dst = out[ch];
                for (let i = 0; i < take; i++) dst[written + i] = chunk[(this.offset + i) * this.channels + src];
            }
            written += take;
            this.offset += take;
            if (this.offset >= chunk.length / this.channels) { this.queue.shift(); this.offset = 0; }
        }
        for (let ch = 0; ch < out.length; ch++) out[ch].fill(0, written);   // underrun: silence
        this.played += frames;
        if (this.played - this.lastReport >= sampleRate) {
            this.lastReport = this.played;
            this.port.postMessage({ played: this.played });
        }
        return true;
    }
}

registerProcessor('xl-audio', XlAudioProcessor);
