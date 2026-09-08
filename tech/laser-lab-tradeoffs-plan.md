# Laser Lab: meaningful weapon choices

## Build sequence
1. Replace capacitor pulse size with reservoir capacity (400/1,000/2,000/5,000 EU). Charge it from the battery at its rated output; conserve energy during charging, firing, and cancellation.
2. Add discharge mechanisms: immediate 40 EU pulses; hold-to-charge up to 4 emitter pulses, release to fire; continuous flow at the emitter/controller throughput. No mechanism damage multiplier.
3. Add focused (4 unit), balanced (18 unit), and wide (60 unit) beam profiles. Use actual finite-width collision and energy interception: a target receives the fraction of the beam width it intersects. Wider beams forgive aim but waste energy on empty space. Only the nearest intercepted target receives damage.
4. Add repeatable scenarios: small erratic drones, brief target vulnerability windows, durable moving targets. Keep the calibration patterns.
5. Provide Pulse pistol, Charge rifle, and Tracking beam starter assemblies. Add live reservoir/charge readouts, scenario explanations and appropriate damage/accuracy labels.
6. Verify energy conservation, early-release charge, cancellation refunds, thermal lockout, width collisions, scenario shielding, all presets, and syntax/UI operation.

## Rules
Battery begins full, capacitor begins empty. Transfer energy only into free reservoir space. Charge-up reserves energy from the capacitor; canceled charge returns it. Reserved energy counts toward reservoir capacity. Cooling remains active during recharge. No firing while paused, invalid, or thermally locked. Charged attacks fire on deliberate release; pointer cancellation, blur, pause and reset cancel them. Continuous beam metrics count simulation samples and label them accordingly, rather than pretending samples are bullets.

Technology remains optional and off by default. Existing mobility and guide toggle remain. Heavy stabilization, incoming attacks, session history and automated balance optimization are later work. This iteration demonstrates behavior tradeoffs; it does not assert that tuning is balanced.
