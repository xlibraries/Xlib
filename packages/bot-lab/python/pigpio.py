# Bot Lab's pigpio: the pigpio daemon's Python API over the simulated bench. pi() connects at once (there's no
# daemon to start); GPIO, PWM, servo pulses, edge callbacks and I2C work as on a Pi.
import _bench

INPUT, OUTPUT, ALT0 = 0, 1, 4
PUD_OFF, PUD_DOWN, PUD_UP = 0, 1, 2
LOW, HIGH, TIMEOUT = 0, 1, 2
RISING_EDGE, FALLING_EDGE, EITHER_EDGE = 0, 1, 2
OFF, ON, CLEAR, SET, TOGGLE = 0, 1, 0, 1, 2

_PULLS = {PUD_OFF: "none", PUD_DOWN: "down", PUD_UP: "up"}


class error(Exception):
    pass


def _gpio(g):
    g = int(g)
    if not _bench.has_pin(g):
        raise error(f"GPIO {g} is not on Bot Lab's header (bad gpio)")
    return g


def _tick():
    return int(_bench.time() * 1_000_000) & 0xFFFFFFFF


def tickDiff(t1, t2):
    return (t2 - t1) & 0xFFFFFFFF


class _callback:
    def __init__(self, pi, gpio, edge, func):
        self.gpio, self.edge, self.func, self.count = gpio, edge, func, 0
        self._last = pi.read(gpio)
        self._pi = pi
        import gpiozero
        self._scheduler = gpiozero._scheduler
        self._scheduler.at(0, self._watch)

    def _watch(self):
        level = self._pi.read(self.gpio)
        if level != self._last:
            self._last = level
            if self.edge == EITHER_EDGE or (self.edge == RISING_EDGE and level) or (self.edge == FALLING_EDGE and not level):
                self.count += 1
                if self.func is not None:
                    self.func(self.gpio, level, _tick())
        return 0.0005

    def cancel(self):
        self._scheduler.cancel(self._watch)

    def tally(self):
        return self.count

    def reset_tally(self):
        self.count = 0


class pi:
    def __init__(self, host="localhost", port=8888, show_errors=True):
        self.connected = True
        self._modes = {}
        self._range = {}
        self._freq = {}
        self._duty = {}
        self._servo = {}
        self._handles = {}

    def stop(self):
        self.connected = False

    # GPIO
    def set_mode(self, gpio, mode):
        g = _gpio(gpio)
        self._modes[g] = mode
        _bench.mode(g, "output" if mode == OUTPUT else "input", "none")
        return 0

    def get_mode(self, gpio):
        return self._modes.get(_gpio(gpio), INPUT)

    def set_pull_up_down(self, gpio, pud):
        g = _gpio(gpio)
        if self._modes.get(g, INPUT) != OUTPUT:
            _bench.mode(g, "input", _PULLS[pud])
        return 0

    def read(self, gpio):
        return 1 if _bench.read(_gpio(gpio)) else 0

    def write(self, gpio, level):
        g = _gpio(gpio)
        if self._modes.get(g) != OUTPUT:
            self.set_mode(g, OUTPUT)
        self._duty.pop(g, None)
        self._servo.pop(g, None)
        _bench.write(g, bool(level))
        return 0

    # PWM (software, as pigpio's default)
    def set_PWM_range(self, gpio, range_):
        self._range[_gpio(gpio)] = int(range_)
        return 0

    def get_PWM_range(self, gpio):
        return self._range.get(_gpio(gpio), 255)

    def set_PWM_frequency(self, gpio, frequency):
        g = _gpio(gpio)
        self._freq[g] = int(frequency)
        if g in self._duty:
            self.set_PWM_dutycycle(g, self._duty[g])
        return self._freq[g]

    def get_PWM_frequency(self, gpio):
        return self._freq.get(_gpio(gpio), 800)

    def set_PWM_dutycycle(self, gpio, dutycycle):
        g = _gpio(gpio)
        rng = self.get_PWM_range(g)
        if not 0 <= dutycycle <= rng:
            raise error(f"dutycycle not 0-{rng} (bad dutycycle)")
        self._modes[g] = OUTPUT
        _bench.mode(g, "output", "none")
        self._duty[g] = dutycycle
        _bench.pwm(g, self.get_PWM_frequency(g), dutycycle / rng)
        return 0

    def get_PWM_dutycycle(self, gpio):
        g = _gpio(gpio)
        if g not in self._duty:
            raise error("GPIO is not in use for PWM (not PWM gpio)")
        return self._duty[g]

    def hardware_PWM(self, gpio, PWMfreq, PWMduty):
        g = _gpio(gpio)
        self._modes[g] = ALT0
        _bench.mode(g, "output", "none")
        _bench.pwm(g, int(PWMfreq), max(0, min(1_000_000, int(PWMduty))) / 1_000_000)
        return 0

    # Servos: 500–2500 µs at 50 Hz; 0 stops the pulses
    def set_servo_pulsewidth(self, gpio, pulsewidth):
        g = _gpio(gpio)
        if pulsewidth != 0 and not 500 <= pulsewidth <= 2500:
            raise error("pulsewidth not 0 or 500-2500 (bad pulsewidth)")
        self._modes[g] = OUTPUT
        _bench.mode(g, "output", "none")
        self._servo[g] = pulsewidth
        _bench.pulse(g, float(pulsewidth), 20_000.0)
        return 0

    def get_servo_pulsewidth(self, gpio):
        g = _gpio(gpio)
        if g not in self._servo:
            raise error("GPIO is not in use for servo pulses (not servo gpio)")
        return self._servo[g]

    # Edges and time
    def callback(self, user_gpio, edge=RISING_EDGE, func=None):
        return _callback(self, _gpio(user_gpio), edge, func)

    def wait_for_edge(self, user_gpio, edge=RISING_EDGE, wait_timeout=60.0):
        import time
        g = _gpio(user_gpio)
        last = self.read(g)
        end = _bench.time() + wait_timeout
        while _bench.time() < end:
            time.sleep(0.0005)
            level = self.read(g)
            if level != last:
                if edge == EITHER_EDGE or (edge == RISING_EDGE and level) or (edge == FALLING_EDGE and not level):
                    return True
                last = level
        return False

    def get_current_tick(self):
        return _tick()

    # I2C (bus 1 only)
    def i2c_open(self, i2c_bus, i2c_address, i2c_flags=0):
        if int(i2c_bus) != 1:
            raise error("bad I2C bus (Bot Lab's Pi has I2C bus 1)")
        handle = len(self._handles)
        while handle in self._handles:
            handle += 1
        self._handles[handle] = int(i2c_address)
        return handle

    def i2c_close(self, handle):
        self._addr(handle)
        del self._handles[handle]
        return 0

    def _addr(self, handle):
        if handle not in self._handles:
            raise error("unknown handle (bad handle)")
        return self._handles[handle]

    def _xfer(self, handle, data=(), read=0):
        from smbus2 import _xfer
        try:
            return _xfer(self._addr(handle), data, read)
        except OSError:
            raise error("I2C read failed" if read else "I2C write failed")

    def i2c_write_quick(self, handle, bit):
        self._xfer(handle)
        return 0

    def i2c_read_byte(self, handle):
        return self._xfer(handle, read=1)[0]

    def i2c_write_byte(self, handle, byte_val):
        self._xfer(handle, [byte_val])
        return 0

    def i2c_read_byte_data(self, handle, reg):
        return self._xfer(handle, [reg], 1)[0]

    def i2c_write_byte_data(self, handle, reg, byte_val):
        self._xfer(handle, [reg, byte_val])
        return 0

    def i2c_read_word_data(self, handle, reg):
        lo, hi = self._xfer(handle, [reg], 2)
        return lo | (hi << 8)

    def i2c_write_word_data(self, handle, reg, word_val):
        self._xfer(handle, [reg, word_val & 0xFF, (word_val >> 8) & 0xFF])
        return 0

    def i2c_read_i2c_block_data(self, handle, reg, count):
        data = self._xfer(handle, [reg], count)
        return len(data), bytearray(data)

    def i2c_write_i2c_block_data(self, handle, reg, data):
        self._xfer(handle, [reg, *data])
        return 0

    def i2c_read_device(self, handle, count):
        data = self._xfer(handle, read=count)
        return len(data), bytearray(data)

    def i2c_write_device(self, handle, data):
        self._xfer(handle, list(data))
        return 0
