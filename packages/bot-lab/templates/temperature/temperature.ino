// Temperature: a TMP102 on the Uno's I2C pins (A4 = SDA, A5 = SCL) reports the temperature twice a second.
// Change its temperature in the inspector and watch the serial monitor follow.
#include <Wire.h>

const int TMP102 = 0x48;

void setup() {
  Serial.begin(9600);
  Wire.begin();
}

void loop() {
  Wire.beginTransmission(TMP102);
  Wire.write(0);                       // the temperature register
  if (Wire.endTransmission() != 0) {
    Serial.println("no TMP102 at 0x48: check SDA, SCL and its power");
    delay(1000);
    return;
  }
  Wire.requestFrom(TMP102, 2);
  int high = Wire.read();
  int low = Wire.read();
  // 12 bits of two's complement, 0.0625 C each. An Uno's int is 16 bits, so the shift keeps the sign below zero.
  int raw = (int)((high << 8) | low) >> 4;
  Serial.print("temperature: ");
  Serial.print(raw * 0.0625);
  Serial.println(" C");
  delay(500);
}
