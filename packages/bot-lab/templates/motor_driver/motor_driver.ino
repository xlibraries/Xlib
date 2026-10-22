// Motor and driver: a TB6612 drives the motor on channel A. The sketch ramps it up forwards, then backwards.
// Direction comes from AIN1/AIN2, speed from PWM on PWMA. STBY must be high for the driver to do anything.
const int PWMA = 5, AIN1 = 7, AIN2 = 8, STBY = 9;

void setup() {
  pinMode(AIN1, OUTPUT);
  pinMode(AIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
  digitalWrite(STBY, HIGH);
  Serial.begin(9600);
}

// speed: -255 (full reverse) to 255 (full forward)
void drive(int speed) {
  digitalWrite(AIN1, speed > 0 ? HIGH : LOW);
  digitalWrite(AIN2, speed < 0 ? HIGH : LOW);
  analogWrite(PWMA, abs(speed));
}

void loop() {
  for (int speed = 0; speed <= 255; speed += 51) {
    drive(speed);
    Serial.print("speed ");
    Serial.println(speed);
    delay(500);
  }
  for (int speed = 0; speed >= -255; speed -= 51) {
    drive(speed);
    Serial.print("speed ");
    Serial.println(speed);
    delay(500);
  }
  drive(0);
  delay(1000);
}
