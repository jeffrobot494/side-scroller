# Side Scroller

A 2D side-scrolling action game for the browser, built from scratch on the
HTML5 Canvas API — no framework, no build step.

## Run it

The code uses ES modules, so it must be served over HTTP (not opened as a
`file://` path). Any static server works:

```bash
# Python (already on most machines)
python3 -m http.server 8000
# then open http://localhost:8000
```

or, if you have Node:

```bash
npx serve .
```

## Controls

- **Move:** Arrow keys or `A` / `D`
- **Jump:** Space, `W`, or Up arrow

## Structure

| File            | Responsibility                                      |
| --------------- | --------------------------------------------------- |
| `index.html`    | Canvas element + page shell                         |
| `src/main.js`   | Fixed-timestep game loop, camera, rendering         |
| `src/input.js`  | Keyboard → logical actions (left/right/jump)        |
| `src/player.js` | Player physics, movement feel, collision            |
| `src/world.js`  | Level layout and world constants (gravity, size)    |
