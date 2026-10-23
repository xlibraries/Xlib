// Pick and place: the conveyor brings cubes to its end stop. When the sensor over that spot sees one, the belt stops,
// the arm picks the cube up, drops it in the bin and comes home, and the belt starts again. Five cubes: how fast can
// it go without dropping any? (The poses were worked out with the arm's inverse kinematics.)
#include <Servo.h>

Servo base, shoulder, elbow, wrist, gripper;

const int SENSOR = 2;                                // the TCRT5000 over the pick spot: LOW when it sees a light cube
const int STBY = 4, PWMA = 5, AIN1 = 7, AIN2 = 8;    // the conveyor's motor, through a TB6612
const int BELT_SPEED = 120;

struct Pose { int base, shoulder, elbow, wrist; };
const Pose HOME = {117, 89, 74, 73};
const Pose PICK_ABOVE = {90, 102, 78, 90};
const Pose PICK = {90, 107, 96, 113};
// four spots across the bin, so the cubes spread out instead of stacking into a tower that topples
const Pose DROP_ABOVE[4] = {{165, 115, 62, 87}, {150, 127, 44, 81}, {159, 92, 91, 92}, {140, 104, 77, 91}};
const Pose DROP[4] = {{165, 118, 79, 107}, {150, 128, 65, 102}, {159, 97, 107, 114}, {140, 108, 93, 112}};
const int OPEN = 20, CLOSED = 180;

Pose now = HOME;
int picked = 0;

// eases from where the arm is to `to` in 20 ms steps: a servo told to jump would fling the cube
void moveTo(Pose to, int ms) {
  int steps = max(1, ms / 20);
  Pose from = now;
  for (int i = 1; i <= steps; i++) {
    base.write(from.base + (to.base - from.base) * i / steps);
    shoulder.write(from.shoulder + (to.shoulder - from.shoulder) * i / steps);
    elbow.write(from.elbow + (to.elbow - from.elbow) * i / steps);
    wrist.write(from.wrist + (to.wrist - from.wrist) * i / steps);
    delay(20);
  }
  now = to;
}

void belt(bool on) {
  digitalWrite(AIN1, HIGH);
  digitalWrite(AIN2, LOW);
  analogWrite(PWMA, on ? BELT_SPEED : 0);
}

void setup() {
  Serial.begin(9600);
  base.attach(9);
  shoulder.attach(10);
  elbow.attach(11);
  wrist.attach(12);
  gripper.attach(13);
  moveTo(HOME, 20);
  gripper.write(OPEN);
  pinMode(SENSOR, INPUT);
  pinMode(STBY, OUTPUT);
  pinMode(AIN1, OUTPUT);
  pinMode(AIN2, OUTPUT);
  digitalWrite(STBY, HIGH);
  belt(true);
}

void loop() {
  if (digitalRead(SENSOR) != LOW) return;   // nothing at the end of the belt yet
  delay(500);                               // the sensor sees it coming: let the belt park it against the end stop
  belt(false);
  delay(200);
  moveTo(PICK_ABOVE, 800);
  moveTo(PICK, 500);
  gripper.write(CLOSED);
  delay(400);
  moveTo(PICK_ABOVE, 500);
  int spot = picked % 4;
  moveTo(DROP_ABOVE[spot], 900);
  moveTo(DROP[spot], 400);
  gripper.write(OPEN);
  delay(300);
  moveTo(DROP_ABOVE[spot], 300);
  moveTo(HOME, 700);
  picked++;
  Serial.print("cube ");
  Serial.print(picked);
  Serial.println(" in the bin");
  belt(true);
}
