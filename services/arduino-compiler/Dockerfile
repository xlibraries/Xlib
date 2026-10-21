# The Arduino compiler Bot Lab uses: arduino-cli with the AVR core and the libraries the templates need, pinned.
# Two modes (entrypoint.sh):
# - no arguments: the compile service (server.py) on $PORT, as deployed to Cloud Run; needs COMPILER_SECRET
# - a sketch name: compiles /sketch/<name>/<name>.ino for the Uno and prints the Intel HEX on stdout, e.g.
#   docker build -t xlib-arduino-compiler . && docker run --rm -v "$PWD/sketch:/sketch" xlib-arduino-compiler blink
FROM debian:bookworm-slim
ARG CLI_VERSION=1.2.2
ARG AVR_CORE=1.8.6
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh -s ${CLI_VERSION}
ENV ARDUINO_DIRECTORIES_DATA=/opt/arduino ARDUINO_DIRECTORIES_DOWNLOADS=/opt/arduino/staging ARDUINO_DIRECTORIES_USER=/opt/arduino/user \
    ARDUINO_BUILD_CACHE_PATH=/opt/arduino/build-cache
RUN arduino-cli config init --overwrite && arduino-cli core update-index && arduino-cli core install arduino:avr@${AVR_CORE} \
    && arduino-cli lib install Servo@1.2.2 && rm -rf /opt/arduino/staging
# Visitors' sketches compile as this user: it can't read the service's environment or its files
RUN useradd --system --no-create-home --shell /usr/sbin/nologin builder \
    && mkdir -p /opt/arduino/build-cache /opt/arduino/staging && chown -R builder /opt/arduino/build-cache /opt/arduino/staging
COPY compile.sh /usr/local/bin/compile
COPY entrypoint.sh /usr/local/bin/entrypoint
COPY server.py /opt/service/server.py
RUN chmod +x /usr/local/bin/compile /usr/local/bin/entrypoint
# Warm the core cache, so a fresh instance's first build doesn't compile the Arduino core (several seconds)
RUN mkdir -p /tmp/warm/warm && printf 'void setup(){pinMode(13,OUTPUT);}\nvoid loop(){digitalWrite(13,!digitalRead(13));delay(500);}\n' > /tmp/warm/warm/warm.ino \
    && chown -R builder /tmp/warm && su -s /bin/sh builder -c "arduino-cli compile --fqbn arduino:avr:uno /tmp/warm/warm" >/dev/null && rm -rf /tmp/warm
WORKDIR /sketch
ENV PORT=8080
ENTRYPOINT ["entrypoint"]
