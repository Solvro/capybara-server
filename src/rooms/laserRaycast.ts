export type Cell = { x: number; y: number; value?: number };

export function raycastToWall(
  grid: number[],
  width: number,
  height: number,
  startX: number,
  startY: number,
  dirX: number,
  dirY: number,
): Cell[] {
  const cells: Cell[] = [];

  const stepX = Math.sign(dirX);
  const stepY = Math.sign(dirY);

  let x = startX + stepX;
  let y = startY + stepY;

  while (x >= 0 && x < width && y >= 0 && y < height) {
    const idx = y * width + x;
    const val = grid[idx];
    cells.push({ x, y, value: val });

    if (val === 1 || val === 2) {
      break;
    }

    x += stepX;
    y += stepY;
  }

  return cells;
}