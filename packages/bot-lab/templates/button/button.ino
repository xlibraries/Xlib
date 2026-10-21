// Button: a push button on pin 2 (to ground, using the pull-up) lights the LED on pin 13 while held, and reports
// presses on the serial monitor.
void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("press the button");
}

bool was_pressed = false;

void loop() {
  bool pressed = digitalRead(2) == LOW;
  digitalWrite(13, pressed ? HIGH : LOW);
  if (pressed != was_pressed) {
    Serial.println(pressed ? "pressed" : "released");
    was_pressed = pressed;
  }
  delay(10);
}
