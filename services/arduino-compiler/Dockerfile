# The Arduino compiler Bot Lab uses: arduino-cli with the AVR core and the libraries the templates need, pinned.
# Locally: docker build -t xlib-arduino-compiler . && docker run --rm -v "$PWD/sketch:/sketch" xlib-arduino-compiler
# (compiles /sketch/<name>/<name>.ino for the Uno and prints the Intel HEX on stdout).
FROM debian:bookworm-slim
ARG CLI_VERSION=1.2.2
ARG AVR_CORE=1.8.6
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh -s ${CLI_VERSION}
ENV ARDUINO_DIRECTORIES_DATA=/opt/arduino ARDUINO_DIRECTORIES_DOWNLOADS=/opt/arduino/staging ARDUINO_DIRECTORIES_USER=/opt/arduino/user
RUN arduino-cli config init --overwrite && arduino-cli core update-index && arduino-cli core install arduino:avr@${AVR_CORE} \
    && arduino-cli lib install Servo@1.2.2 && rm -rf /opt/arduino/staging
COPY compile.sh /usr/local/bin/compile
RUN chmod +x /usr/local/bin/compile
WORKDIR /sketch
ENTRYPOINT ["compile"]
