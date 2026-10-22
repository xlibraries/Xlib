# Firmware for Bot Lab's Raspberry Pi Pico

`scripts/vendor.mjs` in the site copies these to `/vendor/pico/`; `src/sim/boards/pico.ts` runs them on rp2040js.

| File | What | From | SHA-256 |
| --- | --- | --- | --- |
| `micropython-rpi-pico-v1.29.0.uf2` | MicroPython v1.29.0 for the Raspberry Pi Pico, unmodified | <https://micropython.org/resources/firmware/RPI_PICO-20260824-v1.29.0.uf2> | `e1160e602e277d85920adb5fe741435edccba9ba6ecadc85fdab75252eeff4e9` |
| `rp2040-bootrom-b1-nofp.bin` | The RP2040 B1 boot ROM, with its floating-point library zeroed (see below) | `b1.elf` from <https://github.com/raspberrypi/pico-bootrom-rp2040/releases/tag/b1> | `9dce78d5b93ee7d5da8686689f4fdedcebc8cc26ab109f7bad5dd649d0547b88` |

## Why the boot ROM has a hole in it

The boot ROM is BSD-3-licensed, except its floating-point library (`bootrom/mufplib.S` and `mufplib-double.S`,
copyright Mark Owen), which Raspberry Pi licenses "solely on a Raspberry Pi RP2040 device" (or, from its author, under
the GPLv2). A browser isn't an RP2040, so those bytes (0x2758–0x3DAC) are zeroed here, and
`src/sim/boards/pico-rom-float.ts` stands in for each routine in JavaScript when MicroPython calls it. During
development the same MicroPython script printed identical results on the full ROM and on this one with the stand-ins.

To rebuild the file: load the `b1.elf` segment at address 0 into 16 KB, zero `mufp_lib_start`..`mufp_lib_double_end`
(addresses from its symbol table), and write it out.

## Licences

MicroPython is MIT-licensed (Copyright (c) 2013–2026 Damien P. George and contributors); the image also contains the
Raspberry Pi Pico SDK (BSD-3-Clause), TinyUSB (MIT) and other components under their own permissive licences, listed
in <https://github.com/micropython/micropython/blob/v1.29.0/LICENSE>.

The RP2040 boot ROM (the parts shipped here):

> Copyright 2020 (c) 2020 Raspberry Pi (Trading) Ltd.
>
> Redistribution and use in source and binary forms, with or without modification, are permitted provided that the
> following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following
>    disclaimer.
> 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following
>    disclaimer in the documentation and/or other materials provided with the distribution.
> 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote
>    products derived from this software without specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
> INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
> DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
> SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
> SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
> WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
> THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
