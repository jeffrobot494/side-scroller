# After Hours — September 11, 2026

First 3D art-direction study: a rainy downtown street at night, framed as a side-scroller stage. No characters. Procedural architecture, lit windows, storefront signs, fire escapes, streetlights, animated rain, pavement ripples, and stylized light reflections.

Run the existing project with `npm start`, then open http://localhost:8000/visual-design/ in a WebGL-capable browser. Three.js 0.180.0 loads from jsDelivr, so the page needs an internet connection on first load. No build step or changes to game dependencies.

Drag or use left/right arrows to explore. Controls adjust rain, auto-pan, pause animation, and reset. H hides or shows the interface.

`index.html` contains the presentation and controls; `street.js` contains the scene. Wet-street reflections are stylized geometry rather than physically accurate reflections. All assets and today's work live in this directory.

Performance pass: static details are merged into 31 material/spatial batches from 1,230 meshes. Fourteen street sections are culled against the camera frustum with padded bounds. Three procedurally painted skyline planes provide background parallax while the foreground stays 3D. Bloom, rain density, and rendering resolution are preserved.
