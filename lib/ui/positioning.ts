import {
  computePosition,
  flip,
  shift,
  offset,
  type Placement,
} from '@floating-ui/dom';

export interface PositionOptions {
  placement?: Placement;
  offsetPx?: number;
  /** Use 'fixed' when floating element is portaled to body */
  strategy?: 'absolute' | 'fixed';
}

export async function positionElement(
  reference: HTMLElement,
  floating: HTMLElement,
  options: PositionOptions = {}
): Promise<{ x: number; y: number }> {
  const {
    placement = 'bottom-start',
    offsetPx = 4,
    strategy = 'absolute',
  } = options;
  const result = await computePosition(reference, floating, {
    placement,
    strategy,
    middleware: [offset(offsetPx), flip(), shift({ padding: 8 })],
  });
  Object.assign(floating.style, {
    position: strategy,
    left: `${result.x}px`,
    top: `${result.y}px`,
  });
  return { x: result.x, y: result.y };
}
