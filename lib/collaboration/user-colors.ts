const COLOR_PALETTE = [
  'oklch(0.718 0.158 248)',
  'oklch(0.765 0.177 163)',
  'oklch(0.852 0.167 84)',
  'oklch(0.704 0.191 22)',
  'oklch(0.667 0.174 277)',
  'oklch(0.699 0.186 349)',
  'oklch(0.777 0.152 210)',
  'oklch(0.702 0.183 52)',
  'oklch(0.777 0.196 120)',
  'oklch(0.694 0.21 313)',
];

export function assignUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}
