#!/bin/sh
# compile <sketch dir under /sketch> [fqbn]: prints the hex on stdout, compiler messages on stderr
set -e
name="${1:?sketch name}"
fqbn="${2:-arduino:avr:uno}"
out=$(mktemp -d)
arduino-cli compile --fqbn "$fqbn" --output-dir "$out" "/sketch/$name" 1>&2
cat "$out"/*.ino.hex
