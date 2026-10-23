// React drawing primitives for iso-kit paths, adapted from the Anatomy kit (kit/react/draw.tsx).
import type { CSSProperties } from 'react';
import type { Flat, LineTone, SolidPaths, Tone } from './iso-kit';

const tenth = (value: number) => Math.round(value * 10) / 10;

export function Solid({ paths, tone = 'hi', crease = 'faint', halo = false, lit = false, flat = false }: { paths: SolidPaths; tone?: Tone; crease?: Tone | 'none'; halo?: boolean; lit?: boolean; flat?: boolean }) {
  return <g className="iso-solid" data-lit={lit ? '' : undefined} data-seamless={paths.seamless ? '' : undefined}>
    {halo && <path className="iso-halo" d={paths.fill} />}
    <path className="iso-fill" d={paths.fill} />
    {!flat && paths.shades.map((d, shade) => d ? <path key={shade} className="iso-shade" data-shade={shade} d={d} /> : null)}
    {!flat && <path className="iso-top" d={paths.top} />}
    {crease !== 'none' && paths.crease && <path className="iso-line" data-tone={crease} d={paths.crease} />}
    {crease !== 'none' && paths.bevel && <path className="iso-line" data-tone={crease} d={paths.bevel} />}
    <path className="iso-line iso-edge" data-tone={tone} d={paths.outline} />
  </g>;
}

export function Line({ d, tone = 'lo', free, style }: { d: string; tone?: LineTone; free?: boolean | 'start' | 'end'; style?: CSSProperties }) {
  if (!d) return null;
  return <path className="iso-line" data-tone={tone} data-free={free === true ? '' : free || undefined} d={d} style={style} />;
}

export function Dots({ points, size = 0.5, tone = 'mid' }: { points: Flat[]; size?: number; tone?: Tone }) {
  return <g className="iso-dots" data-tone={tone}>{points.map(([x, y], index) => <circle key={index} cx={tenth(x)} cy={tenth(y)} r={size} />)}</g>;
}

export function FaceText({ transform, children, size = 3, tone = 'mid', anchor = 'start' }: { transform: string; children: string; size?: number; tone?: Tone; anchor?: 'start' | 'middle' | 'end' }) {
  return <text className="iso-face-text" data-tone={tone} transform={transform} fontSize={size} textAnchor={anchor}>{children}</text>;
}
