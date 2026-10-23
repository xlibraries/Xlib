// A 16x2 character LCD with an I2C backpack (address 0x27): a greeting with a custom heart character on the top
// line, and the knob on A0 as a number and a bar on the bottom. LiquidCrystal_I2C talks to the backpack.
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

byte heart[8] = {0b00000, 0b01010, 0b11111, 0b11111, 0b11111, 0b01110, 0b00100, 0b00000};
byte block[8] = {0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111};

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.createChar(0, heart);
  lcd.createChar(1, block);
  lcd.setCursor(0, 0);
  lcd.print("Hello, Bot Lab ");
  lcd.write(byte(0));
}

void loop() {
  int knob = analogRead(A0);
  lcd.setCursor(0, 1);
  lcd.print(knob);
  lcd.print("    ");                    // clear what a longer number left behind
  int bars = map(knob, 0, 1023, 0, 11);
  lcd.setCursor(5, 1);
  for (int i = 0; i < 11; i++) {
    if (i < bars) lcd.write(byte(1)); else lcd.print(' ');
  }
  delay(100);
}
