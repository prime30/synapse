declare module 'culori' {
  interface Color {
    mode: string;
    [key: string]: unknown;
  }

  interface Oklch extends Color {
    mode: 'oklch';
    l: number;
    c: number;
    h?: number;
    alpha?: number;
  }

  interface Rgb extends Color {
    mode: 'rgb';
    r: number;
    g: number;
    b: number;
    alpha?: number;
  }

  type ColorInput = string | Color | undefined;

  export function parse(color: string): Color | undefined;
  export function formatHex(color: ColorInput): string;
  export function formatHex8(color: ColorInput): string;
  export function converter(mode: string): (color: ColorInput) => Color | undefined;
  export function wcagContrast(color1: ColorInput, color2: ColorInput): number;
  export function interpolate(colors: ColorInput[], mode?: string): (t: number) => Color;
  export function differenceCiede2000(): (color1: ColorInput, color2: ColorInput) => number;
}
