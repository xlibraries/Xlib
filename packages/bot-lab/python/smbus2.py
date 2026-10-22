# Bot Lab's smbus2: the same API as the library, over the bench's I²C bus 1 (GPIO2 = SDA, GPIO3 = SCL). A device
# that isn't there (unwired, unpowered, another address) raises OSError 121, as on a real Pi.
import _bench

I2C_SMBUS_BLOCK_MAX = 32


def _xfer(address, data=(), read=0):
    reply = _bench.i2c_xfer(int(address), ",".join(str(int(b) & 0xFF) for b in data), int(read))
    if reply == "!":                     # nothing answered: a NACK
        raise OSError(121, "Remote I/O error")
    return [int(b) for b in reply.split(",")] if reply else []


class i2c_msg:
    """One message of an i2c_rdwr transaction."""

    def __init__(self, addr, flags, buf):
        self.addr, self.flags, self.buf = addr, flags, bytearray(buf)
        self.len = len(self.buf)

    @staticmethod
    def read(address, length):
        return i2c_msg(address, 1, bytes(length))

    @staticmethod
    def write(address, buf):
        if isinstance(buf, str):
            buf = buf.encode()
        return i2c_msg(address, 0, bytes(buf))

    def __iter__(self):
        return iter(self.buf)

    def __len__(self):
        return self.len

    def __bytes__(self):
        return bytes(self.buf)

    def __repr__(self):
        return f"i2c_msg({self.addr}, {self.flags}, {bytes(self.buf)!r})"


class SMBus:
    def __init__(self, bus=None, force=False):
        self.fd = None
        self.funcs = 0
        if bus is not None:
            self.open(bus)

    def open(self, bus):
        if str(bus) not in ("1", "/dev/i2c-1"):
            raise FileNotFoundError(2, f"No such file or directory: '/dev/i2c-{bus}' (Bot Lab's Pi has I2C bus 1)")
        self.fd = 1

    def close(self):
        self.fd = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def _check(self):
        if self.fd is None:
            raise OSError(9, "Bad file descriptor (the bus isn't open)")

    def write_quick(self, i2c_addr, force=None):
        self._check()
        _xfer(i2c_addr)

    def read_byte(self, i2c_addr, force=None):
        self._check()
        return _xfer(i2c_addr, read=1)[0]

    def write_byte(self, i2c_addr, value, force=None):
        self._check()
        _xfer(i2c_addr, [value])

    def read_byte_data(self, i2c_addr, register, force=None):
        self._check()
        return _xfer(i2c_addr, [register], 1)[0]

    def write_byte_data(self, i2c_addr, register, value, force=None):
        self._check()
        _xfer(i2c_addr, [register, value])

    def read_word_data(self, i2c_addr, register, force=None):
        """SMBus words are little-endian (low byte first)."""
        self._check()
        lo, hi = _xfer(i2c_addr, [register], 2)
        return lo | (hi << 8)

    def write_word_data(self, i2c_addr, register, value, force=None):
        self._check()
        _xfer(i2c_addr, [register, value & 0xFF, (value >> 8) & 0xFF])

    def read_i2c_block_data(self, i2c_addr, register, length, force=None):
        self._check()
        if length > I2C_SMBUS_BLOCK_MAX:
            raise ValueError(f"Desired block length over {I2C_SMBUS_BLOCK_MAX} bytes")
        return _xfer(i2c_addr, [register], length)

    def write_i2c_block_data(self, i2c_addr, register, data, force=None):
        self._check()
        if len(data) > I2C_SMBUS_BLOCK_MAX:
            raise ValueError(f"Data length cannot exceed {I2C_SMBUS_BLOCK_MAX} bytes")
        _xfer(i2c_addr, [register, *data])

    def i2c_rdwr(self, *messages):
        """Combined transactions: a write then a read to one address is a register read with a repeated start."""
        self._check()
        i = 0
        while i < len(messages):
            m = messages[i]
            nxt = messages[i + 1] if i + 1 < len(messages) else None
            if m.flags == 0 and nxt is not None and nxt.flags == 1 and nxt.addr == m.addr:
                nxt.buf[:] = bytes(_xfer(m.addr, list(m.buf), nxt.len))
                i += 2
                continue
            if m.flags == 1:
                m.buf[:] = bytes(_xfer(m.addr, read=m.len))
            else:
                _xfer(m.addr, list(m.buf))
            i += 1
