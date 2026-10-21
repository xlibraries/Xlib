// @xlibraries/bot-lab: an electronics and robotics simulator for the desktop. The app is createBotLab(); the
// simulation (sim/) is headless and usable on its own.
export { createBotLab } from './BotLab';
export { Bench, TICK } from './sim/bench';
export { CATALOG, LED_MODELS, type PartSpec, type PinSpec } from './sim/parts/catalog';
export { Uno, UNO_CLOCK } from './sim/boards/uno';
export { parseHex } from './sim/boards/hex';
export { Netlist, Resistor, Capacitor, Inductor, Diode, Switch, VoltageSource, CurrentSource, GROUND, type Element, type Solution } from './sim/circuit/mna';
export { addPart, connect, disconnect, emptyProject, nets, parseProject, removePart, loadProjects, saveProjects, type Project, type PartInstance, type Wire, type PinRef } from './sim/project';
export { TEMPLATES, template, type Template } from './templates';
