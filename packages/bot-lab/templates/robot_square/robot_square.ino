// Robot: two gear motors through a TB6612 (left on channel A, right on B) drive a square: forwards, turn, repeat.
// Watch it in the World view. The turn is timed, so battery voltage and floor grip change how square it comes out.
const int STBY = 9;
const int PWMA = 5, AIN1 = 7, AIN2 = 8;    // left motor
const int PWMB = 6, BIN1 = 11, BIN2 = 12;  // right motor

void motor(int pwm, int in1, int in2, int speed) {   // speed -255..255
  digitalWrite(in1, speed > 0 ? HIGH : LOW);
  digitalWrite(in2, speed < 0 ? HIGH : LOW);
  analogWrite(pwm, abs(speed));
}

void drive(int left, int right) {
  motor(PWMA, AIN1, AIN2, left);
  motor(PWMB, BIN1, BIN2, right);
}

void setup() {
  int outputs[] = {STBY, AIN1, AIN2, BIN1, BIN2};
  for (int pin : outputs) pinMode(pin, OUTPUT);
  digitalWrite(STBY, HIGH);
  Serial.begin(9600);
}

void loop() {
  Serial.println("forward");
  drive(160, 160);
  delay(1200);
  Serial.println("turn");
  drive(-140, 140);
  delay(330);
  drive(0, 0);
  delay(200);
}
