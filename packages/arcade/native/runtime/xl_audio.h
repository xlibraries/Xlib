// Sound output for Arcade games: a push-model mixer API (the game asks how many frames the output wants, mixes
// them, and pushes them) on top of a Web Audio AudioWorklet (xl-audio-worklet.js, served next to the game's build).
// Replaces sokol_audio's ScriptProcessorNode backend, which browsers have deprecated.
//
// Include once per game with XL_AUDIO_IMPL defined (after xl.h, which provides the file locator).
#pragma once
#include <cstddef>

namespace xl {

/** Starts audio with `channels` interleaved channels. Sound begins after the visitor's first click or key. */
void audio_setup(int channels);
void audio_shutdown();
int audio_sample_rate();
/** How many frames to push now to keep the output fed (0 when it's full or audio isn't ready). */
int audio_expect();
/** Interleaved float frames in -1..1. */
void audio_push(const float* frames, int count);

} // namespace xl

#ifdef XL_AUDIO_IMPL
#include <emscripten.h>

EM_JS(int, xl_audio_js_setup, (int channels), {
    if (Module.xlAudio) return 1;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || !("audioWorklet" in Ctx.prototype)) return 0;
    const ctx = new Ctx({ latencyHint: "interactive" });
    const state = { ctx: ctx, node: null, channels: channels, written: 0, played: 0, playedAt: 0, ready: false };
    Module.xlAudio = state;
    const url = Module.locateFile ? Module.locateFile("xl-audio-worklet.js") : "xl-audio-worklet.js";
    ctx.audioWorklet.addModule(url).then(() => {
        state.node = new AudioWorkletNode(ctx, "xl-audio", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [channels] });
        state.node.port.onmessage = (e) => { if (e.data && typeof e.data.played === "number") { state.played = e.data.played; state.playedAt = ctx.currentTime; } };
        state.node.connect(ctx.destination);
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
    try { if (s.node) s.node.disconnect(); s.ctx.close(); } catch (e) {}
    Module.xlAudio = null;
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
#endif
