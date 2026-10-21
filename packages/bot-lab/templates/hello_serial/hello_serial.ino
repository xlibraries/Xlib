// Hello: says hello on the serial monitor once a second, with the time since reset, and reads A0.
void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.print("hello from the bench, t=");
  Serial.print(millis());
  Serial.print(" ms, A0=");
  Serial.println(analogRead(A0));
  delay(1000);
}
