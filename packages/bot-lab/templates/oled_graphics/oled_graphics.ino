// A 128x64 OLED (SSD1306, I2C address 0x3C) drawn with Adafruit_GFX: a title, a ball bouncing round a box, and the
// knob on A0 as a bar along the bottom. display.display() sends the whole picture after each frame is drawn.
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);

int x = 20, y = 30, dx = 3, dy = 2;

void setup() {
  Serial.begin(115200);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("no OLED at 0x3C");
    while (true) {}
  }
  Serial.println("OLED ready");
}

void loop() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.print("Bot Lab OLED");
  display.drawRect(0, 12, 128, 40, SSD1306_WHITE);
  display.fillCircle(x, y, 4, SSD1306_WHITE);
  x += dx; y += dy;
  if (x < 6 || x > 121) dx = -dx;
  if (y < 18 || y > 45) dy = -dy;
  int knob = analogRead(A0);
  display.fillRect(0, 56, map(knob, 0, 1023, 0, 128), 8, SSD1306_WHITE);
  display.display();
  delay(30);
}
