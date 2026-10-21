# Bot Lab: time follows the simulation. Imported first by the runtime, before any user code.
import time as _time
import _bench

def sleep(seconds):
    """Runs the bench for `seconds` (servicing gpiozero's background jobs on the way) instead of blocking."""
    seconds = float(seconds)
    if seconds < 0:
        raise ValueError("sleep length must be non-negative")
    import gpiozero as _g
    end = _bench.time() + seconds
    while True:
        now = _bench.time()
        if now >= end - 1e-9:      # done within a nanosecond is done (floating point never lands exactly)
            break
        step = max(1e-6, min(end - now, _g._scheduler.horizon(now)))
        if _bench.paced():
            _run_sync(_bench.run_paced(step))   # real time: Python is suspended while the clock catches up
        else:
            _bench.run(step)                    # fast-forward
        # either raises when the user presses Stop
        _g._scheduler.service(_bench.time())

try:
    from pyodide.ffi import run_sync as _run_sync
except ImportError:      # an older Pyodide: only fast-forwarding
    _run_sync = None


def now():
    return _bench.time()

def pause():
    """signal.pause(): on a Pi it waits for a signal (in gpiozero scripts, forever while callbacks run). Here it keeps
    the bench running until Stop; Pyodide's own returns at once, which would end the script before any press."""
    while True:
        sleep(0.05)


import signal as _signal
_signal.pause = pause

_time.sleep = sleep
_time.time = now
_time.monotonic = now
_time.perf_counter = now
