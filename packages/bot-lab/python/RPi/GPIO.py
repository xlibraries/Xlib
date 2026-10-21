# Bot Lab's RPi.GPIO: the classic API over the simulated bench (`_bench`). BCM numbering only.
import _bench

BCM, BOARD = 11, 10
OUT, IN = 0, 1
HIGH, LOW = 1, 0
PUD_OFF, PUD_DOWN, PUD_UP = 20, 21, 22
RISING, FALLING, BOTH = 31, 32, 33

_mode = None
_pwms = []


def setmode(mode):
    global _mode
    if mode not in (BCM, BOARD):
        raise ValueError("An invalid mode was passed to setmode()")
    if mode == BOARD:
        raise ValueError("Bot Lab's header uses BCM numbering; call GPIO.setmode(GPIO.BCM)")
    _mode = mode


def getmode():
    return _mode


def setwarnings(flag):
    pass


def _check(pin):
    if _mode is None:
        raise RuntimeError("Please set pin numbering mode using GPIO.setmode(GPIO.BCM)")
    if not _bench.has_pin(int(pin)):
        raise ValueError(f"GPIO{pin} is not on the header")
    return int(pin)


def setup(channel, direction, pull_up_down=PUD_OFF, initial=None):
    pins = channel if isinstance(channel, (list, tuple)) else [channel]
    for pin in pins:
        pin = _check(pin)
        if direction == OUT:
            _bench.mode(pin, "output", "none")
            if initial is not None:
                _bench.write(pin, bool(initial))
        else:
            _bench.mode(pin, "input", "up" if pull_up_down == PUD_UP else "down" if pull_up_down == PUD_DOWN else "none")


def output(channel, value):
    pins = channel if isinstance(channel, (list, tuple)) else [channel]
    values = value if isinstance(value, (list, tuple)) else [value] * len(pins)
    for pin, v in zip(pins, values):
        _bench.write(_check(pin), bool(v))


def input(channel):
    return HIGH if _bench.read(_check(channel)) else LOW


def cleanup(channel=None):
    for pwm in list(_pwms):
        pwm.stop()
    for pin in _bench.pins():
        _bench.mode(pin, "input", "none")


class PWM:
    def __init__(self, channel, frequency):
        self.pin = _check(channel)
        self.frequency = float(frequency)
        self.duty = 0.0
        self.running = False
        _pwms.append(self)

    def start(self, dc):
        self.running = True
        self.ChangeDutyCycle(dc)

    def ChangeDutyCycle(self, dc):
        if not 0 <= dc <= 100:
            raise ValueError("dutycycle must have a value from 0.0 to 100.0")
        self.duty = float(dc)
        if self.running:
            _bench.pwm(self.pin, self.frequency, self.duty / 100)

    def ChangeFrequency(self, frequency):
        self.frequency = float(frequency)
        if self.running:
            _bench.pwm(self.pin, self.frequency, self.duty / 100)

    def stop(self):
        self.running = False
        _bench.write(self.pin, False)
        if self in _pwms:
            _pwms.remove(self)
