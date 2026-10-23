// One 7-segment digit (common cathode) counting 0 to 9, a second a step; the dot blinks every half second.
// Segments a-g and the dot on pins 2-9, each through its own resistor; the common pin to GND.
const int SEGMENT_PINS[8] = {2, 3, 4, 5, 6, 7, 8, 9};   // a b c d e f g dp

// which segments light for each digit, a in bit 0 ... g in bit 6
const byte DIGITS[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};

void show(int digit, bool dot) {
  for (int s = 0; s < 7; s++) digitalWrite(SEGMENT_PINS[s], (DIGITS[digit] >> s) & 1);
  digitalWrite(SEGMENT_PINS[7], dot);
}

void setup() {
  Serial.begin(115200);
  for (int s = 0; s < 8; s++) pinMode(SEGMENT_PINS[s], OUTPUT);
}

void loop() {
  for (int digit = 0; digit < 10; digit++) {
    Serial.println(digit);
    show(digit, true);
    delay(500);
    show(digit, false);
    delay(500);
  }
}
