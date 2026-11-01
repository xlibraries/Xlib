/**
 * @file xl_audio.cpp
 * @brief xl_audio.h in the browser: an AudioContext, the xl-audio AudioWorklet and a GainNode for the volume.
 *
 * The page reaches the gain through `Module.xlSetVolume` (and `Module.xlVolume` before audio starts: see
 * `applyVolume` in `@xlibraries/engine-react`).
 */
#include "xl_audio.h"

#include <emscripten.h>
#include <emscripten.h>

EM_JS(int, xl_audio_js_setup, (int channels), {
    if (Module.xlAudio) return 1;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || !("audioWorklet" in Ctx.prototype)) return 0;
    const ctx = new Ctx({ latencyHint: "interactive" });
    const state = { ctx: ctx, node: null, gain: ctx.createGain(), channels: channels, written: 0, played: 0, playedAt: 0, ready: false };
    state.gain.gain.value = typeof Module.xlVolume === "number" ? Module.xlVolume : 1;
    state.gain.connect(ctx.destination);
    // the page sets the desktop's master volume through this (EngineView in @xlibraries/engine-react)
    Module.xlSetVolume = (v) => { Module.xlVolume = v; state.gain.gain.value = Math.max(0, Math.min(1, v)); };
    Module.xlAudio = state;
    const url = Module.locateFile ? Module.locateFile("xl-audio-worklet.js") : "xl-audio-worklet.js";
    ctx.audioWorklet.addModule(url).then(() => {
        state.node = new AudioWorkletNode(ctx, "xl-audio", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [channels] });
        state.node.port.onmessage = (e) => { if (e.data && typeof e.data.played === "number") { state.played = e.data.played; state.playedAt = ctx.currentTime; } };
        state.node.connect(state.gain);
        state.ready = true;
    }).catch((err) => { console.warn("xl_audio: worklet failed to load", err); });
    // browsers only start audio after a user gesture
    const resume = () => { if (ctx.state === "suspended" || ctx.state === "interrupted") ctx.resume().catch(() => {}); };
    document.addEventListener("click", resume, { once: true });
    document.addEventListener("keydown", resume, { once: true });
    document.addEventListener("touchend", resume, { once: true });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resume(); });
    return 1;
});

EM_JS(void, xl_audio_js_shutdown, (), {
    const s = Module.xlAudio;
    if (!s) return;
    try { if (s.node) s.node.disconnect(); s.gain.disconnect(); s.ctx.close(); } catch (e) {}
    Module.xlAudio = null;
    Module.xlSetVolume = (v) => { Module.xlVolume = v; };
});

EM_JS(int, xl_audio_js_sample_rate, (), { return Module.xlAudio ? Module.xlAudio.ctx.sampleRate : 0; });

// Frames wanted: keep about 60 ms queued ahead of what the worklet has played (estimated from its last report
// plus the time since, so the estimate stays right even while no reports arrive)
EM_JS(int, xl_audio_js_expect, (), {
    const s = Module.xlAudio;
    if (!s || !s.ready || s.ctx.state !== "running") return 0;
    const rate = s.ctx.sampleRate;
    const played = s.played + Math.max(0, s.ctx.currentTime - s.playedAt) * rate;
    const queued = s.written - played;
    const lead = Math.round(rate * 0.06);
    if (queued < 0) s.written = played;   // underrun: start again from now
    return Math.max(0, Math.round(lead - Math.max(0, queued)));
});

EM_JS(void, xl_audio_js_push, (const float* ptr, int frames), {
    const s = Module.xlAudio;
    if (!s || !s.ready || !s.node) return;
    const samples = frames * s.channels;
    const chunk = new Float32Array(samples);
    chunk.set(HEAPF32.subarray(ptr >> 2, (ptr >> 2) + samples));
    s.node.port.postMessage(chunk, [chunk.buffer]);
    s.written += frames;
});

namespace xl {

void audio_setup(int channels) { xl_audio_js_setup(channels); }
void audio_shutdown() { xl_audio_js_shutdown(); }
int audio_sample_rate() { const int r = xl_audio_js_sample_rate(); return r > 0 ? r : 48000; }
int audio_expect() { return xl_audio_js_expect(); }
void audio_push(const float* frames, int count) { if (count > 0) xl_audio_js_push(frames, count); }

} // namespace xl
