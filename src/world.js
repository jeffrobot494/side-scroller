// The level layout. Everything is in world coordinates (pixels). Later this is
// the kind of data you'd load from a level file / editor instead of hardcoding.

export const WORLD = {
  width: 3000,
  height: 540,
  gravity: 2000, // pixels per second^2
};

// Axis-aligned rectangles the player stands on and collides with.
export const PLATFORMS = [
  // Ground
  { x: 0, y: 500, w: 3000, h: 40 },
  // Floating platforms
  { x: 400, y: 400, w: 160, h: 20 },
  { x: 650, y: 320, w: 160, h: 20 },
  { x: 950, y: 380, w: 200, h: 20 },
  { x: 1300, y: 300, w: 120, h: 20 },
  { x: 1550, y: 420, w: 240, h: 20 },
  { x: 2000, y: 350, w: 180, h: 20 },
];
