/**
 * @file xl_audio.h
 * @brief Sound output: a push-model mixer API on a Web Audio AudioWorklet.
 *
 * The module asks how many frames the output wants, mixes them, and pushes them; the worklet
 * (xl-audio-worklet.js, served beside the module's build) plays them through a GainNode the desktop's volume slider
 * drives. Replaces sokol_audio's ScriptProcessorNode backend, which browsers have deprecated. The implementation is
 * linked into every module that uses `@xlibraries/engine-audio`.
 */
#pragma once
#include <cstddef>

namespace xl {

/**
 * Starts audio. Sound begins after the visitor's first click or key (browsers require a gesture).
 * @param channels How many interleaved channels the module will push.
 */
void audio_setup(int channels);

/** Stops audio and releases the AudioContext. */
void audio_shutdown();

/**
 * The output's sample rate.
 * @return Frames per second (48000 until audio is running).
 */
int audio_sample_rate();

/**
 * How many frames to push now to keep the output fed (about 60 ms ahead of what has played).
 * @return The frame count; 0 when the queue is full or audio isn't ready.
 */
int audio_expect();

/**
 * Queues frames for playback.
 * @param frames Interleaved samples, -1..1, `count` frames of the channels given to audio_setup().
 * @param count How many frames.
 */
void audio_push(const float* frames, int count);

} // namespace xl
