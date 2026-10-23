// Static paths of the session gauge, built once at module load: a dial indicator on a magnetic stand whose
// plunger rests on a screw jack. World units are about 1 px of the real object; x and y lie on the floor, z is up.
import * as k from '../../iso/iso-kit';
import type { Flat, Plane, Point3, SolidPaths } from '../../iso/iso-kit';
import { TURNS } from './model';

export const WIDTH = 520;
export const HEIGHT = 330;

const PLATE = { x: -96, y: -52, w: 196, d: 104, r: 8 };
const PLATE_H = 10, FOOT_H = 5;
const MAG = { x: -86, y: -18, w: 40, d: 36, r: 3 };
const MAG_H = 22;
const POST: Plane = [-74, 0];
const POST_TOP = 116, CLAMP_Z = 96;

export const DIAL: Plane = [44, 0];
export const DIAL_R = 31;
const DIAL_Z = 78, DIAL_H = 10;
export const DIAL_TOP = DIAL_Z + DIAL_H;
export const SMALL: Plane = [DIAL[0], DIAL[1] - 12];
export const SMALL_R = 7.4;

// The jack lifts the anvil by LIFT_PER_TURN for every needle turn, so plunger height and needle always agree.
export const LIFT_PER_TURN = 1;
const JACK_WHEEL_TOP = 9;
export const SLEEVE_TOP = 15;
const SCREW_R = 3.1;
const ANVIL_H = 2.6;
const ANVIL_AT_REST = SLEEVE_TOP + 1.4;
const TIP_R = 2.4;

export const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [POST[0], POST[1], POST_TOP + 2], [DIAL[0] + DIAL_R, DIAL[1], DIAL_TOP], [DIAL[0] - DIAL_R, DIAL[1], DIAL_TOP]],
  WIDTH, HEIGHT, { pad: 18, azimuth: 42 }
);

const at = (point: Point3): Flat => k.iso(point, P);
const byDepth = (points: Plane[]) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

export const base = (() => {
  const feet = byDepth(k.corners(PLATE, 20)).map(([x, y]) => ({ pad: k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), boss: k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28) }));
  const screws = k.corners(PLATE, 9);
  const strip = { x: -84, y: PLATE.y + PLATE.d - 13, w: 172, d: 7, r: 1 };
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  const label = { x: -36, y: PLATE.y + 7, w: 40, d: 14, r: 1.4 };
  return {
    halo: k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P),
    feet,
    plate: k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6),
    groove: k.planOutline(k.insetPlan(PLATE, 5), 0, P),
    screwRings: screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(''),
    screwDots: screws.map(([x, y]) => at([x, y, 0])),
    strip: k.slabOf(strip, 0, 0.6, P, 3),
    stripTicks: ticks,
    stripDots: [at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])],
    label: k.slabOf(label, 0, 0.6, P, 3),
    labelRules: [4, 7, 10].map((y, index) => k.lineOnTop([label.x + 7, label.y + y], [label.x + label.w - (index === 2 ? 16 : 5), label.y + y], 0.6, P)).join(''),
    labelDots: [at([label.x + 3, label.y + 7, 0.6]), at([label.x + label.w - 2.6, label.y + 7, 0.6])]
  };
})();

export const stand = (() => {
  const knob: Plane = [MAG.x + 31, MAG.y + 27];
  const clamp = { x: POST[0] - 7, y: POST[1] - 7, w: 14, d: 14, r: 2.5 };
  const arm = { x: POST[0] + 7, y: -3, w: DIAL[0] - DIAL_R - POST[0] - 7 - 4, d: 6, r: 2 };
  const thumb: Plane = [clamp.x + 7, clamp.y + clamp.d + 4.4];
  return {
    magnetLow: k.slabOf(MAG, 0, 11, P, 6, 0.8),
    magnetHigh: k.slabOf(k.insetPlan(MAG, 0.8), 11, MAG_H - 11, P, 6, 0.8),
    magnetGroove: k.planOutline(k.insetPlan(MAG, 3), MAG_H, P),
    magnetDots: [at([MAG.x + 5, MAG.y + 5, MAG_H]), at([MAG.x + 5, MAG.y + MAG.d - 5, MAG_H]), at([MAG.x + MAG.w - 5, MAG.y + 5, MAG_H])],
    knob: k.cylinder(knob[0], knob[1], 6, MAG_H, 4, P, 32),
    knobKnurl: k.knurl(knob[0], knob[1], 6, MAG_H, MAG_H + 4, 36, P),
    knobIndex: k.lineOnTop(knob, [knob[0] + 6, knob[1]], MAG_H + 4, P),
    knobDot: [at([knob[0], knob[1], MAG_H + 4])],
    collar: k.cylinder(POST[0], POST[1], 5, MAG_H, 4, P, 28),
    postLow: k.cylinder(POST[0], POST[1], 3.2, MAG_H + 4, CLAMP_Z - MAG_H - 8, P, 28),
    postMarks: [56, 76].map(z => k.sideArc(POST[0], POST[1], 3.2, z, P, 16)).join(''),
    clamp: k.slabOf(clamp, CLAMP_Z - 4, 12, P, 4, 0.6),
    postHigh: k.cylinder(POST[0], POST[1], 3.2, CLAMP_Z + 8, POST_TOP - CLAMP_Z - 8, P, 28),
    cap: k.cylinder(POST[0], POST[1], 3.8, POST_TOP, 2, P, 28),
    arm: k.slabOf(arm, CLAMP_Z, 4, P, 4, 0.5),
    armDots: [at([arm.x + 4, 0, CLAMP_Z + 4]), at([arm.x + arm.w - 5, 0, CLAMP_Z + 4])],
    thumbNeck: k.slabOf({ x: thumb[0] - 1.4, y: clamp.y + clamp.d, w: 2.8, d: 2, r: 0.8 }, CLAMP_Z + 1, 4, P, 2),
    thumb: k.cylinder(thumb[0], thumb[1], 2.6, CLAMP_Z, 6, P, 20),
    thumbKnurl: k.knurl(thumb[0], thumb[1], 2.6, CLAMP_Z, CLAMP_Z + 6, 18, P)
  };
})();

export const jack = (() => {
  const [x, y] = DIAL;
  return {
    halo: k.haloOf({ x: x - 13, y: y - 13, w: 26, d: 26, r: 13 }, 0, 0.1, P),
    flange: k.cylinder(x, y, 15, 0, 3, P, 40, 0.5),
    flangeDots: byDepth([0, 1, 2, 3].map(i => [x + Math.cos(i * Math.PI / 2 + Math.PI / 4) * 12.4, y + Math.sin(i * Math.PI / 2 + Math.PI / 4) * 12.4] as Plane)).map(([px, py]) => at([px, py, 3])),
    wheel: k.cylinder(x, y, 12, 3, JACK_WHEEL_TOP - 3, P, 48, 0.5),
    wheelKnurl: k.knurl(x, y, 12, 3, JACK_WHEEL_TOP, 64, P, 0.5),
    wheelRing: k.ring(x, y, 8.4, JACK_WHEEL_TOP, P, 40),
    sleeve: k.cylinder(x, y, 5.2, JACK_WHEEL_TOP, SLEEVE_TOP - JACK_WHEEL_TOP, P, 32),
    sleeveMark: k.sideArc(x, y, 5.2, JACK_WHEEL_TOP + 3, P, 20)
  };
})();

// Moving parts of the jack. The wheel's index mark turns with the screw: 1/4 turn of the wheel per needle turn.
export function wheelIndexAt(turns: number) {
  const angle = turns * Math.PI / 2;
  const [x, y] = DIAL;
  return k.lineOnTop([x + Math.sin(angle) * 8.6, y - Math.cos(angle) * 8.6], [x + Math.sin(angle) * 11.6, y - Math.cos(angle) * 11.6], JACK_WHEEL_TOP, P);
}
// The exposed part of the screw grows with the lift, so it is the one solid rebuilt per frame.
export function screwAt(lift: number): { body: SolidPaths; threads: string } {
  const [x, y] = DIAL;
  const top = ANVIL_AT_REST + lift;
  const threads: string[] = [];
  for (let z = top - 1.2; z > SLEEVE_TOP + 0.4; z -= 1.2) threads.push(k.sideArc(x, y, SCREW_R, z, P, 14));
  return { body: k.cylinder(x, y, SCREW_R, SLEEVE_TOP, top - SLEEVE_TOP, P, 20), threads: threads.join('') };
}
export const anvil = (() => {
  const [x, y] = DIAL;
  return { body: k.cylinder(x, y, 7, ANVIL_AT_REST, ANVIL_H, P, 36, 0.4), ring: k.ring(x, y, 4.6, ANVIL_AT_REST + ANVIL_H, P, 28) };
})();
// The plunger is drawn at rest on the anvil and moved with translateAlong; it reaches into the dial stem.
export const plunger = (() => {
  const [x, y] = DIAL;
  const tip = ANVIL_AT_REST + ANVIL_H;
  return { tip: k.cylinder(x, y, TIP_R, tip, 2.2, P, 20), rod: k.cylinder(x, y, 1.4, tip + 2.2, 52 - tip, P, 16) };
})();
export const liftOffset = (lift: number) => k.translateAlong(P, [0, 0, lift]);

export const dial = (() => {
  const [x, y] = DIAL;
  const main = k.radialTicks(x, y, DIAL_R - 3.2, 50, 5, DIAL_TOP, [1.4, 3], P);
  const small = k.radialTicks(SMALL[0], SMALL[1], SMALL_R, TURNS, 3, DIAL_TOP, [0.9, 1.7], P);
  return {
    stem: k.cylinder(x, y, 3, 50, DIAL_Z - 50, P, 20),
    stemMark: k.sideArc(x, y, 3, 58, P, 12),
    lug: k.slabOf({ x: x - DIAL_R - 6, y: -4, w: 8, d: 8, r: 1.5 }, DIAL_Z + 2, CLAMP_Z - DIAL_Z - 2, P, 3, 0.4),
    body: k.cylinder(x, y, DIAL_R, DIAL_Z, DIAL_H, P, 72, 0.8),
    bezelKnurl: k.knurl(x, y, DIAL_R, DIAL_TOP - 3.4, DIAL_TOP, 96, P, 0.3),
    bezelSeam: k.sideArc(x, y, DIAL_R, DIAL_TOP - 3.4, P, 44),
    faceRing: k.ring(x, y, DIAL_R - 2.4, DIAL_TOP, P, 72),
    ticks: main,
    smallRing: k.ring(SMALL[0], SMALL[1], SMALL_R + 0.8, DIAL_TOP, P, 32),
    smallTicks: small,
    crown: k.slabOf({ x: x + DIAL_R - 1, y: -2.4, w: 5, d: 4.8, r: 1.2 }, DIAL_Z + 2, 5, P, 3),
    crownCap: k.slabOf({ x: x + DIAL_R + 3.6, y: -3.2, w: 2.6, d: 6.4, r: 1.2 }, DIAL_Z + 1.2, 6.6, P, 3),
    hub: k.cylinder(x, y, 1.8, DIAL_TOP, 0.9, P, 16),
    smallHub: [at([SMALL[0], SMALL[1], DIAL_TOP])],
    label: k.topMatrix([x, y + 14], DIAL_TOP, P, 'x')
  };
})();

const onFace = (center: Plane, turn: number, from: number, to: number) => {
  const angle = turn * Math.PI * 2;
  return k.lineOnTop([center[0] + Math.sin(angle) * from, center[1] - Math.cos(angle) * from], [center[0] + Math.sin(angle) * to, center[1] - Math.cos(angle) * to], DIAL_TOP + 0.2, P);
};
export const needleAt = (turns: number) => onFace(DIAL, turns % 1, -3.6, DIAL_R - 4.4);
export const smallHandAt = (turns: number) => onFace(SMALL, turns / TURNS, -1, SMALL_R - 0.8);
// The plan marker sits just outside the small dial, like a tolerance marker on a real indicator's bezel.
export const planMarkAt = (turns: number) => onFace(SMALL, turns / TURNS, SMALL_R + 1.2, SMALL_R + 3);
