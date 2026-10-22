// Line follower: two TCRT5000 sensors straddle the line, left on D2, right on D3 (HIGH = over the black line).
// When one of them sees the line, the robot steers towards that side until it doesn't. Try changing SPEED, OUTER and INNER:
// faster laps, or off the track.
const int STBY = 9;
const int PWMA = 5, AIN1 = 7, AIN2 = 8;    // left motor
const int PWMB = 6, BIN1 = 11, BIN2 = 12;  // right motor
const int LEFT_SENSOR = 2, RIGHT_SENSOR = 3;

const int SPEED = 160;   // straight ahead
const int OUTER = 200;   // the outside wheel in a turn
const int INNER = 0;     // the inside wheel in a turn

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
  pinMode(LEFT_SENSOR, INPUT);
  pinMode(RIGHT_SENSOR, INPUT);
  digitalWrite(STBY, HIGH);
}

void loop() {
  bool left = digitalRead(LEFT_SENSOR) == HIGH;
  bool right = digitalRead(RIGHT_SENSOR) == HIGH;
  if (left && !right) drive(INNER, OUTER);      // the line is under the left sensor: turn left
  else if (right && !left) drive(OUTER, INNER); // under the right one: turn right
  else drive(SPEED, SPEED);                     // between them (or both on a crossing): straight on
}
