// Quadcopter hover: a flight controller on an Uno. It reads the MPU-6050 (gyro and accelerometer) and the HC-SR04
// (height), keeps the quad level with a PD loop on roll and pitch, holds 50 cm with a PD loop on height, and mixes it
// all onto four ESCs. Three knobs set the gains while it flies: A0 the attitude P, A1 the attitude D, A2 the height P.
// The Monitor's plot shows roll, pitch and height. It takes off, hovers for 13 seconds, and lands.
#include <Wire.h>
#include <Servo.h>

Servo esc[4];                                  // front-left, front-right, back-left, back-right
const int ESC_PINS[4] = {3, 5, 6, 9};
const int TRIG = 7, ECHO = 8;
const int MPU = 0x68;

const float HOVER_US = 1530;                   // the throttle that about holds it up
const float TARGET = 0.50;                     // metres
float roll = 0, pitch = 0;                     // degrees: right side down, nose up
float height = 0, lastHeight = 0, climb = 0;   // metres, m/s
float trim = 0;                                // µs: the height loop's integral, what hovering really takes
unsigned long started, lastLoop, lastRange, lastPrint;

void mpuWrite(int reg, int value) { Wire.beginTransmission(MPU); Wire.write(reg); Wire.write(value); Wire.endTransmission(); }

void readImu(float& ax, float& ay, float& az, float& gx, float& gy, float& gz) {
  Wire.beginTransmission(MPU);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU, 14);
  int16_t v[7];
  for (int i = 0; i < 7; i++) { int16_t hi = Wire.read(); v[i] = (hi << 8) | Wire.read(); }
  ax = v[0] / 8192.0; ay = v[1] / 8192.0; az = v[2] / 8192.0;      // ±4 g
  gx = v[4] / 65.5; gy = v[5] / 65.5; gz = v[6] / 65.5;            // ±500 °/s
}

float readHeight() {
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long us = pulseIn(ECHO, HIGH, 15000);                   // up to 2.5 m
  return us == 0 ? height : us / 5800.0;                           // 58 µs per cm
}

void setThrottle(float us[4]) { for (int i = 0; i < 4; i++) esc[i].writeMicroseconds(constrain((int)us[i], 1000, 2000)); }

void setup() {
  Serial.begin(115200);
  Wire.begin();
  mpuWrite(0x6B, 0);                           // wake up
  mpuWrite(0x1B, 0x08);                        // gyro ±500 °/s
  mpuWrite(0x1C, 0x08);                        // accel ±4 g
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  float off[4] = {1000, 1000, 1000, 1000};
  for (int i = 0; i < 4; i++) esc[i].attach(ESC_PINS[i]);
  setThrottle(off);
  delay(2000);                                 // the ESCs arm on a low signal
  started = lastLoop = lastRange = lastPrint = millis();
}

void loop() {
  unsigned long now = millis();
  if (now - lastLoop < 4) return;              // a 250 Hz control loop
  float dt = (now - lastLoop) / 1000.0;
  lastLoop = now;

  float ax, ay, az, gx, gy, gz;
  readImu(ax, ay, az, gx, gy, gz);
  // complementary filter: the gyro for quick changes, the accelerometer, slowly, for which way is down (in flight a
  // quad's accelerometer mostly feels its own thrust, so it only gets a small say)
  float rollRate = gx, pitchRate = -gy;        // the chip's X points forward, its Y left
  roll = 0.998 * (roll + rollRate * dt) + 0.002 * degrees(atan2(-ay, az));
  pitch = 0.998 * (pitch + pitchRate * dt) + 0.002 * degrees(atan2(-ax, az));

  if (now - lastRange >= 60) {                 // the rangefinder, every 60 ms
    float dts = (now - lastRange) / 1000.0;
    lastRange = now;
    lastHeight = height;
    height = readHeight();
    climb = 0.7 * climb + 0.3 * (height - lastHeight) / dts;
  }

  // the flight plan: rise to 50 cm over 2 s, hold until 15 s, come down over 3 s, then stop
  float t = (now - started) / 1000.0;
  float target = t < 2 ? TARGET * t / 2 : t < 15 ? TARGET : max(0.0, TARGET * (18 - t) / 3);
  float off[4] = {1000, 1000, 1000, 1000};
  if (t > 18.5 && height < 0.06) { setThrottle(off); return; }

  float kp = analogRead(A0) / 1023.0 * 10;     // µs per degree
  float kd = analogRead(A1) / 1023.0 * 1.5;    // µs per degree per second
  float kh = analogRead(A2) / 1023.0 * 300;    // µs per metre
  float p = kp * (0 - pitch) - kd * pitchRate; // nose-up command
  float r = kp * (0 - roll) - kd * rollRate;   // right-down command
  float y = -0.8 * gz;                         // stop it turning
  if (height > 0.05) trim = constrain(trim + 0.6 * kh * (target - height) * dt, -150, 150);
  float throttle = HOVER_US + trim + kh * (target - height) - 0.8 * kh * climb;

  float us[4] = {throttle + p + r + y, throttle + p - r - y, throttle - p + r - y, throttle - p - r + y};
  setThrottle(us);

  if (now - lastPrint >= 100) {
    lastPrint = now;
    Serial.print("roll:"); Serial.print(roll, 1);
    Serial.print(",pitch:"); Serial.print(pitch, 1);
    Serial.print(",height:"); Serial.print(height * 100, 0);
    Serial.print(",target:"); Serial.println(target * 100, 0);
  }
}
