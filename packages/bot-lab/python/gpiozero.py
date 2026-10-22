# Bot Lab's gpiozero: the same API as the Raspberry Pi library, over the simulated bench (the `_bench` module the
# runtime provides). No threads: background work (blink, when_pressed) runs on a scheduler serviced while the
# script sleeps.
import _bench


class GPIOZeroError(Exception):
    pass


class PinInvalidPin(GPIOZeroError):
    pass


class _Scheduler:
    """Jobs run while time.sleep() advances the simulation."""

    def __init__(self):
        self.jobs = []   # (due time, callback) pairs; a callback may return the next delay

    def at(self, delay, callback):
        self.jobs.append([_bench.time() + max(0.0, delay), callback])

    def cancel(self, callback):
        self.jobs = [j for j in self.jobs if j[1] is not callback]

    def horizon(self, now):
        """How far the bench may run before a job is due."""
        due = [j[0] for j in self.jobs]
        return max(0.0005, min(due) - now) if due else 0.05

    def service(self, now):
        for job in list(self.jobs):
            if job[0] <= now:
                self.jobs.remove(job)
                again = job[1]()
                if again is not None:
                    self.jobs.append([now + max(0.0, again), job[1]])


_scheduler = _Scheduler()


def _call(callback, device):
    """As gpiozero does: no arguments if the callback takes none (functions, lambdas, bound methods like led.on),
    otherwise the device."""
    import inspect
    try:
        inspect.signature(callback).bind()
        takes_none = True
    except TypeError:
        takes_none = False
    except ValueError:      # no signature (some builtins): call it bare
        takes_none = True
    return callback() if takes_none else callback(device)


def _bcm(pin):
    if isinstance(pin, str):
        pin = pin.upper().replace("GPIO", "").replace("BCM", "")
    try:
        pin = int(pin)
    except (TypeError, ValueError):
        raise PinInvalidPin(f"invalid pin spec: {pin!r}")
    if not _bench.has_pin(pin):
        raise PinInvalidPin(f"GPIO{pin} is not on the header")
    return pin


class Device:
    def __init__(self, pin=None):
        self.pin = _bcm(pin)
        self.closed = False

    def close(self):
        self.closed = True
        _bench.mode(self.pin, "input", "none")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class OutputDevice(Device):
    def __init__(self, pin=None, active_high=True, initial_value=False):
        super().__init__(pin)
        self.active_high = active_high
        _bench.mode(self.pin, "output", "none")
        self.value = 1 if initial_value else 0

    def _write(self, active):
        _bench.write(self.pin, bool(active) == bool(self.active_high))

    @property
    def value(self):
        return int(_bench.read(self.pin) == bool(self.active_high))

    @value.setter
    def value(self, value):
        self._write(bool(value))

    def on(self):
        self.value = 1

    def off(self):
        self.value = 0

    def toggle(self):
        self.value = 0 if self.value else 1

    @property
    def is_active(self):
        return bool(self.value)


class DigitalOutputDevice(OutputDevice):
    def blink(self, on_time=1, off_time=1, n=None, background=True):
        _scheduler.cancel(getattr(self, "_blink_job", None))
        state = {"on": False, "left": n}

        def job():
            if state["left"] is not None and state["left"] <= 0:
                self.off()
                return None
            state["on"] = not state["on"]
            self._write(state["on"])
            if not state["on"] and state["left"] is not None:
                state["left"] -= 1
            return on_time if state["on"] else off_time

        self._blink_job = job
        if background:
            _scheduler.at(0, job)
        else:
            import time
            while True:
                delay = job()
                if delay is None:
                    break
                time.sleep(delay)

    def off(self):
        _scheduler.cancel(getattr(self, "_blink_job", None))
        super().off()


class LED(DigitalOutputDevice):
    pass


class Buzzer(DigitalOutputDevice):
    def beep(self, on_time=1, off_time=1, n=None, background=True):
        self.blink(on_time, off_time, n, background)


class PWMOutputDevice(OutputDevice):
    def __init__(self, pin=None, active_high=True, initial_value=0, frequency=100):
        self.frequency = frequency
        self._value = 0.0
        super().__init__(pin, active_high, False)
        self.value = initial_value

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, value):
        value = float(value)
        if not 0 <= value <= 1:
            raise ValueError("PWMOutputDevice value must be between 0 and 1")
        self._value = value
        duty = value if self.active_high else 1 - value
        _bench.pwm(self.pin, self.frequency, duty)

    def on(self):
        self.value = 1

    def off(self):
        self.value = 0

    def toggle(self):
        self.value = 1 - self.value

    @property
    def is_active(self):
        return self._value > 0

    def pulse(self, fade_in_time=1, fade_out_time=1, n=None, background=True):
        steps = 20
        state = {"i": 0, "left": n}

        def job():
            if state["left"] is not None and state["left"] <= 0:
                self.value = 0
                return None
            i = state["i"] % (2 * steps)
            self.value = i / steps if i < steps else (2 * steps - i) / steps
            state["i"] += 1
            if state["i"] % (2 * steps) == 0 and state["left"] is not None:
                state["left"] -= 1
            return (fade_in_time if i < steps else fade_out_time) / steps

        _scheduler.at(0, job)
        if not background:
            import time
            while any(j[1] is job for j in _scheduler.jobs):
                time.sleep(0.01)


class PWMLED(PWMOutputDevice):
    pass


class InputDevice(Device):
    def __init__(self, pin=None, pull_up=False, active_state=None):
        super().__init__(pin)
        self.pull_up = pull_up
        _bench.mode(self.pin, "input", "up" if pull_up else ("down" if pull_up is False else "none"))
        self._active_state = (not pull_up) if active_state is None else active_state

    @property
    def value(self):
        return int(_bench.read(self.pin) == self._active_state)

    @property
    def is_active(self):
        return bool(self.value)


class Button(InputDevice):
    def __init__(self, pin=None, pull_up=True, active_state=None, bounce_time=None, hold_time=1):
        super().__init__(pin, pull_up, active_state)
        self._when_pressed = None
        self._when_released = None
        self._was = self.is_active
        _scheduler.at(0, self._watch)

    def _watch(self):
        now = self.is_active
        if now != self._was:
            self._was = now
            cb = self._when_pressed if now else self._when_released
            if cb:
                _call(cb, self)
        return 0.005

    @property
    def is_pressed(self):
        return self.is_active

    @property
    def when_pressed(self):
        return self._when_pressed

    @when_pressed.setter
    def when_pressed(self, fn):
        self._when_pressed = fn

    @property
    def when_released(self):
        return self._when_released

    @when_released.setter
    def when_released(self, fn):
        self._when_released = fn

    def wait_for_press(self, timeout=None):
        return self._wait(True, timeout)

    def wait_for_release(self, timeout=None):
        return self._wait(False, timeout)

    def _wait(self, pressed, timeout):
        import time
        end = None if timeout is None else _bench.time() + timeout
        while self.is_active != pressed:
            if end is not None and _bench.time() >= end:
                return False
            time.sleep(0.005)
        return True


class Servo(Device):
    def __init__(self, pin=None, initial_value=0.0, min_pulse_width=1 / 1000, max_pulse_width=2 / 1000, frame_width=20 / 1000):
        super().__init__(pin)
        self.min_pulse_width, self.max_pulse_width, self.frame_width = min_pulse_width, max_pulse_width, frame_width
        _bench.mode(self.pin, "output", "none")
        self._value = None
        self.value = initial_value

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, value):
        if value is None:
            self._value = None
            _bench.pulse(self.pin, 0, self.frame_width * 1e6)
            return
        value = float(value)
        if not -1 <= value <= 1:
            raise ValueError("Servo value must be between -1 and 1, or None")
        self._value = value
        width = self.min_pulse_width + (value + 1) / 2 * (self.max_pulse_width - self.min_pulse_width)
        _bench.pulse(self.pin, width * 1e6, self.frame_width * 1e6)

    def min(self):
        self.value = -1

    def mid(self):
        self.value = 0

    def max(self):
        self.value = 1

    def detach(self):
        self.value = None


class AngularServo(Servo):
    def __init__(self, pin=None, initial_angle=0.0, min_angle=-90, max_angle=90, min_pulse_width=1 / 1000, max_pulse_width=2 / 1000, frame_width=20 / 1000):
        self.min_angle, self.max_angle = min_angle, max_angle
        super().__init__(pin, 0.0, min_pulse_width, max_pulse_width, frame_width)
        self.angle = initial_angle

    @property
    def angle(self):
        if self.value is None:
            return None
        return self.min_angle + (self.value + 1) / 2 * (self.max_angle - self.min_angle)

    @angle.setter
    def angle(self, angle):
        if angle is None:
            self.value = None
            return
        self.value = (float(angle) - self.min_angle) / (self.max_angle - self.min_angle) * 2 - 1


class Motor:
    """A motor through a driver. Two pins (forward and backward, PWM for speed), or, with `enable`, two direction pins
    and a PWM enable pin: the wiring of a TB6612 or L298N (IN1, IN2, PWM/EN)."""

    def __init__(self, forward=None, backward=None, *, enable=None, pwm=True):
        self.enable_device = PWMOutputDevice(enable) if enable is not None else None
        direction = DigitalOutputDevice if (enable is not None or not pwm) else PWMOutputDevice
        self.forward_device = direction(forward)
        self.backward_device = direction(backward)
        self._value = 0.0
        self.value = 0

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, value):
        value = float(value)
        if not -1 <= value <= 1:
            raise ValueError("Motor value must be between -1 and 1")
        self._value = value
        if self.enable_device is not None:
            self.forward_device.value = 1 if value > 0 else 0
            self.backward_device.value = 1 if value < 0 else 0
            self.enable_device.value = abs(value)
        elif value > 0:
            self.backward_device.value = 0
            self.forward_device.value = value
        elif value < 0:
            self.forward_device.value = 0
            self.backward_device.value = -value
        else:
            self.forward_device.value = 0
            self.backward_device.value = 0

    @property
    def is_active(self):
        return self._value != 0

    def reverse(self):
        self.value = -self.value

    def forward(self, speed=1):
        self.value = speed

    def backward(self, speed=1):
        self.value = -speed

    def stop(self):
        self.value = 0

    def close(self):
        self.forward_device.close()
        self.backward_device.close()
        if self.enable_device is not None:
            self.enable_device.close()


class Robot:
    def __init__(self, left=None, right=None, pwm=True):
        self.left_motor = Motor(*left, pwm=pwm)
        self.right_motor = Motor(*right, pwm=pwm)

    def forward(self, speed=1):
        self.left_motor.forward(speed)
        self.right_motor.forward(speed)

    def backward(self, speed=1):
        self.left_motor.backward(speed)
        self.right_motor.backward(speed)

    def left(self, speed=1):
        self.left_motor.backward(speed)
        self.right_motor.forward(speed)

    def right(self, speed=1):
        self.left_motor.forward(speed)
        self.right_motor.backward(speed)

    def stop(self):
        self.left_motor.stop()
        self.right_motor.stop()


def pause():
    """Keeps the script alive while gpiozero's background jobs run, until Stop."""
    import signal
    signal.pause()
