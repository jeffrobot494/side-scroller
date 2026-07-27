---
status: plan
tags: [enemies, ai]
---

# Making Enemies Smarter in a 2D Action Shooter-Platformer

For a 2D action shooter-platformer, enemies usually feel “smart” when they **move deliberately, react believably, and create situations the player must read**. They do not need advanced AI.

## Start with These Five Improvements

### 1. Give Enemies a Preferred Position

Instead of always moving directly toward the player, give each enemy a desired combat range.

```text
Too far away  → approach
At good range → strafe, attack, or reposition
Too close     → retreat, jump away, or use a close-range move
```

Examples:

- Rifle enemy: prefers 8–12 meters.
- Shotgun enemy: prefers 3–5 meters.
- Flying enemy: tries to remain above and diagonally offset.
- Heavy enemy: slowly corners the player rather than chasing constantly.

This alone makes enemies look much more intentional.

### 2. Let Them Evaluate the Arena

Enemies should understand a few basic facts about their surroundings:

- Is there ground ahead?
- Is the player above or below?
- Is a platform reachable by jumping?
- Is there a wall blocking the shot?
- Is the enemy standing in a dangerous location?
- Is the player approaching quickly?
- Is the enemy cornered?

You do not need full pathfinding at first. Use raycasts and predefined platform information.

For example:

```text
If player is above:
    Look for a nearby platform that moves me upward.
If player is below:
    Drop through a platform if safe.
If player is across a gap:
    Jump only if the landing point is valid.
```

For fixed arenas, you can define navigation links between platforms manually. That will often work better than trying to build generalized platformer pathfinding.

### 3. Predict the Player Instead of Aiming Perfectly

A basic enemy fires at the player’s current position. A smarter enemy predicts where the player is going:

```csharp
Vector2 predictedPosition =
    player.Position + player.Velocity * predictionTime;
```

Do not make every shot perfectly predictive. Add variation:

```csharp
float predictionTime = Random.Range(0.15f, 0.45f);
Vector2 aimError = Random.insideUnitCircle * accuracyError;
```

Different enemies can use different aiming styles:

- Rookie: aims at current position.
- Soldier: partially leads the player.
- Sniper: predicts accurately but telegraphs the shot.
- Suppression enemy: shoots where the player is likely to land.
- Grenadier: targets platforms and escape routes rather than the player directly.

The last two often feel smarter than simply increasing accuracy.

### 4. Give Enemies Short-Term Memory

Enemies should not immediately forget the player when line of sight breaks.

Store information such as:

```text
Last known player position
Last known player velocity
Time since player was visible
Last platform occupied by player
Most recent player attack
```

Then enemies can behave believably:

- Fire at the last known position.
- Move to investigate.
- Aim at the platform edge where the player disappeared.
- Prepare an attack near the player’s likely landing point.
- Stop searching after several seconds.

This creates the appearance of reasoning without requiring complicated AI.

### 5. Make Them Choose Between Actions

Avoid rigid scripts such as:

```text
Walk toward player.
If close enough, shoot.
```

Instead, calculate a score for each possible action:

```text
Shoot
Approach
Retreat
Jump to another platform
Dodge
Use special attack
Wait
```

A simple scoring system might look like:

```text
Shoot score =
    lineOfSight
    × weaponReadiness
    × preferredRange
    × confidence

Retreat score =
    playerTooClose
    + lowHealth
    + cornered

Jump score =
    playerAbove
    + badCurrentPosition
    + reachableBetterPlatform
```

Choose the highest-scoring action, with a small amount of randomness. This is commonly called **utility AI**, and it is especially useful for your data-driven boss system because the weights can be stored in JSON.

```json
{
  "preferredRange": 8,
  "decisionInterval": 0.25,
  "actions": {
    "shoot": {
      "baseWeight": 1.0,
      "requiresLineOfSight": true
    },
    "retreat": {
      "baseWeight": 0.4,
      "distanceThreshold": 3
    },
    "jumpToPlatform": {
      "baseWeight": 0.7,
      "playerHeightInfluence": 1.2
    }
  }
}
```

## Make Enemies Respond to Player Habits

A boss can track simple patterns during the fight:

```text
Does the player jump whenever the boss shoots?
Does the player remain on one platform?
Does the player always retreat after attacking?
Does the player stay directly underneath the boss?
Does the player repeatedly dodge in the same direction?
```

The boss can then occasionally counter that behavior:

- Shoot high when the player frequently jumps.
- Attack the player’s landing position.
- Destroy or temporarily deny an overused platform.
- Delay a projectile to catch habitual dodge timing.
- Use an upward attack when the player hides underneath.

Use this sparingly. The enemy should exploit obvious repetition, not instantly counter everything the player does.

## Add Reaction Delays and Commitment

Perfect reactions make AI feel unfair rather than smart.

Give enemies:

- A perception delay.
- A decision interval.
- Attack windups.
- Recovery periods.
- Limited ability to cancel actions.
- Imperfect aim.
- Cooldowns on defensive moves.

For example, once an enemy begins a heavy attack, it should usually commit to it even if the player moves. That gives the player something to understand and exploit.

A strong enemy might make better decisions but still obey the same rules as a weak enemy.

## Separate Intelligence from Difficulty

You can make enemies smarter without making them overwhelmingly harder.

### Intelligence Variables

- Position selection.
- Prediction ability.
- Memory duration.
- Action variety.
- Ability to recognize player habits.
- Cooperation with other enemies.

### Difficulty Variables

- Damage.
- Health.
- Projectile speed.
- Attack frequency.
- Aim error.
- Reaction time.
- Telegraph duration.

This distinction will be important when your LLM modifies bosses. A player saying “the boss is boring” should probably increase behavioral variety, not simply increase its damage.

## For Groups, Give Enemies Roles

Enemies appear much smarter when they coordinate indirectly:

- One pressures the player.
- One maintains distance.
- One attacks from above.
- One denies platforms.
- One waits until another enemy finishes attacking.

You can implement this with an **attack-token system**. Only one or two enemies may use major attacks simultaneously. The others reposition, use weak attacks, or wait.

This prevents chaotic projectile spam and creates the impression that enemies are taking turns and cooperating.

## A Practical Architecture

For your game, I would use four layers:

```text
Perception
    Detect player, obstacles, gaps, platforms, projectiles.

World state
    Store distance, visibility, height difference, danger, memory.

Utility decision system
    Score available actions every 0.2–0.5 seconds.

Action controller
    Execute an action with windup, commitment, and recovery.
```

An action could be represented like this:

```json
{
  "id": "jump_shot",
  "conditions": {
    "playerVisible": true,
    "minimumDistance": 4,
    "requiresReachablePlatform": true
  },
  "scoring": {
    "base": 0.5,
    "playerAbove": 1.0,
    "badCurrentPosition": 0.8
  },
  "execution": {
    "windup": 0.2,
    "jumpForce": [4, 8],
    "fireAtJumpTime": 0.55,
    "recovery": 0.7
  }
}
```

That structure gives your LLM meaningful elements to modify without letting it write arbitrary gameplay code.

## Best Order to Implement It

1. Preferred combat ranges.
2. Gap and wall awareness.
3. Platform navigation links.
4. Predictive but imperfect aiming.
5. Last-known-position memory.
6. Utility-based action selection.
7. Player-pattern tracking.
8. Group coordination.

The biggest early improvement will probably come from **position selection**. An enemy that knows where it wants to stand often feels much smarter than an enemy with ten elaborate attacks but no spatial judgment.
