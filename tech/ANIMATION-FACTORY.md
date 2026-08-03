---
type: tech
category: content-generation
status: idea
resolution: vague
tags: [assets, animation]
---

# Brainstorm: character animation

The best fully automated system should **not require every character to pass through the same pipeline**. It should route each character through one of two production methods:

1. **AI-baked sprite animation** — fastest and most universal.
2. **Template-based cutout puppet** — better for responsive gameplay and procedural aiming.

The system tries the puppet pipeline for recognizable body plans and falls back to baked animation when rigging is unreliable.

```text
Character description or reference image
                ↓
       Morphology classifier
                ↓
    ┌───────────┴────────────┐
    ↓                        ↓
Template rig available?     Unknown / difficult anatomy
    ↓                        ↓
Cutout puppet pipeline      AI video → sprite-sheet pipeline
    └───────────┬────────────┘
                ↓
     Automated Unity importer
                ↓
       Ready-to-use prefab
```

## The critical design decision

Do **not** ask the AI to generate a finished character and then somehow discover how it should be disassembled.

Instead, create a structured `CharacterSpec` first:

```json
{
  "id": "sectoid_grunt_01",
  "view": "side",
  "facing": "right",
  "body_plan": "humanoid_biped",
  "parts": [
    "torso",
    "pelvis",
    "head",
    "upper_arm_near",
    "forearm_near",
    "hand_near",
    "upper_arm_far",
    "forearm_far",
    "hand_far",
    "thigh_near",
    "shin_near",
    "foot_near",
    "thigh_far",
    "shin_far",
    "foot_far"
  ],
  "equipment": ["plasma_pistol"],
  "animations": ["idle", "walk", "run", "fire", "hit", "death"]
}
```

The design agent creates this before image generation. The image generator is therefore producing art for a known topology rather than inventing anatomy that the rigging system must later reverse-engineer.

---

# Track A: AI-baked sprite animations

This should be your **default prototype pipeline**, especially for monsters.

## How it works

### 1. Generate one canonical character image

Generate:

- Exact side view
- Full body
- Facing right
- Stationary camera
- Flat lighting
- Plain background
- Entire silhouette visible
- No ground shadow
- No particles or effects
- Character centered with generous margins

The character does not have to be in a perfect rigging pose because it will not be cut apart.

### 2. Select a driving animation

Maintain a library of simple reference videos:

```text
humanoid_idle.mp4
humanoid_run.mp4
humanoid_rifle_fire.mp4
humanoid_grenade_throw.mp4

quadruped_walk.mp4
quadruped_run.mp4
quadruped_bite.mp4

bird_flight.mp4
serpent_slither.mp4
blob_hop.mp4
spider_walk.mp4
```

These can be:

- Recorded people or animals
- Rough Blender animations
- Placeholder 3D models
- Simple stick figures
- Existing motion-capture clips
- Procedurally generated motion

The visual quality of the driver is irrelevant. Only its movement matters.

### 3. Animate the image with image-to-video

A character-animation model receives:

- The character image
- The driving video
- A fixed-camera instruction
- A plain-background instruction

Wan-Animate, for example, accepts a character image and a reference video and transfers the motion onto the character. It is currently oriented most strongly toward humanoid movement, but this establishes the basic architecture.

Source: [Wan 2.2 GitHub repository](https://github.com/Wan-Video/Wan2.2)

Emerging systems such as DreamActor-M2 are explicitly attempting to generalize motion transfer beyond human skeletons and toward arbitrary non-humanoid characters, but I would treat these as experimental rather than build the prototype around them.

Source: [DreamActor-M2 paper](https://arxiv.org/abs/2601.21716)

### 4. Extract and clean the frames

A deterministic processing stage:

1. Extract every frame.
2. Segment the character.
3. Convert the background to transparency.
4. Find the mask bounding box.
5. Stabilize the character around a chosen anchor.
6. Normalize the canvas size.
7. Remove duplicate frames.
8. Select 8–16 representative frames.
9. Repair frames with obvious identity drift.
10. Pack them into a sprite sheet.

SAM 3 can segment objects from text or visual prompts and track them through video, making it a candidate for extracting the character consistently across generated frames.

Source: [SAM 3 GitHub repository](https://github.com/facebookresearch/sam3)

### 5. Stabilize intelligently

Do not center every frame on its bounding box. That causes jitter.

Each animation defines an anchor:

| Animation | Anchor |
|---|---|
| Idle | Midpoint between feet |
| Walk/run | Planted foot or pelvis |
| Flying | Torso center |
| Slithering | Head or body center |
| Attack | Pelvis or main body mass |
| Death | Original ground-contact point |

The processing agent detects the anchor and translates every frame accordingly.

### 6. Make the animation loop

For an idle, walk, fly, or slither animation:

- Compare the first and last frames.
- Search for the cleanest loop boundary.
- Remove redundant terminal frames.
- Optionally interpolate the seam.
- Reject clips where the loop distance remains too large.

Attacks and deaths do not need to loop.

## Advantages

- No slicing into body parts
- No joint placement
- No mesh weights
- No IK setup
- Works with painterly or detailed art
- Can support bizarre creatures
- Each animation is independent
- Easy Unity import

## Disadvantages

- Aiming cannot be continuously procedural
- Generated details may fluctuate
- Animations may not line up perfectly
- You need a separate generated clip for each action
- Equipment changes require regeneration
- Generated video may create unwanted camera motion

For a prototype, these weaknesses are usually acceptable.

---

# Track B: Automated cutout puppet

Use this for soldiers and frequently reused humanoid enemies.

The central simplification is:

> **Use rigid body-part sprites attached to transforms. Do not use deformable meshes initially.**

A slightly stiff paper-doll soldier is far easier to automate than a beautifully weighted skeletal mesh.

## 1. Generate two images

### Beauty reference

A completed version of the character for visual guidance.

### Exploded puppet sheet

A transparent atlas containing separate parts:

```text
head
torso
pelvis
near upper arm
near forearm
near hand
far upper arm
far forearm
far hand
near thigh
near shin
near foot
far thigh
far shin
far foot
weapon
```

Every part must be:

- Completely visible
- Non-overlapping
- Spaced apart
- Oriented consistently
- Drawn with hidden joint areas completed
- Shown against transparency or a flat key color
- Free of labels touching the artwork

The generation prompt should include a layout diagram and exact part list.

## 2. Segment the atlas

Because the parts are already separated, extraction becomes mostly mechanical:

- Connected-component detection
- Alpha-mask cleanup
- Semantic classification by position and shape
- Vision-model verification
- Individual PNG export

SAM-style segmentation is still useful, but the system should not depend on it correctly separating overlapping finished artwork.

## 3. Fit a known skeleton

Do not ask an LLM to invent bones.

The rig template defines:

- Bone names
- Parent hierarchy
- Expected part
- Joint location rule
- Default layer order
- Rotation limits
- Animation compatibility

Example:

```json
{
  "bone": "forearm_near",
  "parent": "upper_arm_near",
  "sprite": "forearm_near.png",
  "pivot_rule": "proximal_center",
  "child_anchor_rule": "distal_center",
  "rotation_min": -145,
  "rotation_max": 10,
  "sorting_order": 40
}
```

The geometry processor finds the proximal and distal ends of each limb using:

- Mask skeletonization
- Principal-axis analysis
- Part aspect ratio
- Neighbor expectations
- Vision-agent confirmation

The part is then placed between the two relevant joints.

## 4. Hide ugly joints

Automatic rigs will produce gaps. Solve them cheaply:

- Extend limbs underneath neighboring sprites.
- Add circular joint patches.
- Put forearms underneath upper arms.
- Cover knees with kneepads.
- Cover shoulders with armor plates.
- Keep far limbs behind the torso.
- Limit extreme rotations.

For armored characters, these cheats will look surprisingly acceptable.

## 5. Use reusable animation data

Animation clips should not be generated independently for every soldier.

Store transforms in normalized coordinates:

```json
{
  "rig": "humanoid_biped_v1",
  "clip": "rifle_run",
  "fps": 12,
  "loop": true,
  "tracks": {
    "pelvis": [
      {"frame": 0, "x": 0.00, "y": 0.02, "rotation": 0},
      {"frame": 3, "x": 0.02, "y": 0.00, "rotation": 1}
    ],
    "thigh_near": [
      {"frame": 0, "rotation": 28},
      {"frame": 3, "rotation": -24}
    ]
  }
}
```

Any character using `humanoid_biped_v1` inherits:

- Idle
- Walk
- Run
- Crouch
- Jump
- Hit
- Death
- Rifle firing
- Grenade throw

The art changes; the motion library does not.

## 6. Add limited procedural controls

For soldiers, keep the lower-body animation baked while controlling the upper body procedurally:

```text
Target position
      ↓
Weapon angle
      ↓
Firing-hand target
      ↓
Supporting-hand target
      ↓
Two-bone arm solutions
```

Unity supports sprite deformation through Sprite Skin and its normal animation system, although the rigid multi-sprite version can be implemented even more simply with ordinary child transforms and `SpriteRenderer` components.

Source: [Unity Sprite Skin documentation](https://docs.unity.cn/Packages/com.unity.2d.animation%406.0/manual/SpriteSkin.html)

Start with simple transform-based arm solving rather than trying to automate sophisticated skin weights.

---

# Non-humanoid characters

The trick is to support a **small vocabulary of body plans**, not arbitrary anatomy.

## Rig archetypes

### Humanoid biped

```text
pelvis
torso
head
2 arms
2 legs
```

Examples:

- Soldiers
- Sectoids
- Robots
- Goblins

### Quadruped

```text
body
chest
neck
head
front legs ×2
rear legs ×2
tail segments
```

Examples:

- Dogs
- Mutant cats
- Wolves
- Lizard creatures

Animal pose estimation is already supported by toolkits such as MMPose, so it can assist with recognizing or validating standard quadruped keypoints.

Source: [MMPose GitHub repository](https://github.com/open-mmlab/mmpose)

### Arthropod

```text
body
head
leg chains ×4–8
mandibles
optional abdomen
```

Every leg is a repeated two- or three-bone chain. A procedural phase offset creates a convincing walk:

```text
leg phase = base phase + leg index × phase spacing
```

This works for:

- Spiders
- Insects
- Alien crawlers
- Mechanical walkers

### Serpent

```text
head
body segment ×N
tail
```

No image-to-image rig inference is necessary. The animation is a sine wave propagated down the chain:

```text
angle[i] = amplitude × sin(time × speed - i × phase)
```

This may be the easiest non-humanoid creature to automate.

### Flyer

```text
body
head
left wing segments
right wing segments
tail
optional legs
```

Wing motion uses one reusable flap curve. The full sprite receives secondary vertical bobbing.

### Blob

```text
single body sprite
optional eyes
optional mouth
```

Animate using:

- Scale X/Y
- Rotation
- Vertical translation
- Squash and stretch
- Occasional alternate face sprites

This requires no skeleton at all.

### Radial creature

```text
central body
appendage chain ×N
```

Suitable for:

- Tentacle monsters
- Floating alien organisms
- Starfish-like creatures

Each appendage uses the same wave animation with different phase offsets.

## Unknown-creature fallback

When the morphology classifier cannot confidently select a template:

```text
Unknown body plan
      ↓
Try AI-baked sprite animation
      ↓
If that fails:
Generate one static sprite
      ↓
Apply whole-body bob, recoil, shake and squash
```

Even the final fallback produces a usable prototype enemy.

---

# Agent architecture

Use agents for judgment, but use deterministic code for geometry and file creation.

## 1. Character Director

Input:

- Description
- Art style
- Required attacks
- Desired body plan

Output:

- `CharacterSpec.json`
- Required image prompts
- Rig-template selection
- Animation list

## 2. Art Generator

Produces:

- Beauty reference
- Canonical sprite
- Exploded parts atlas
- Weapons
- Optional effects

## 3. Visual QA Agent

Checks:

- Correct number of limbs
- Side-facing orientation
- No cropped anatomy
- No overlapping atlas parts
- Weapon separated correctly
- Silhouette readability
- Character consistency
- Plain background

It returns structured failures:

```json
{
  "passed": false,
  "errors": [
    {
      "code": "MISSING_PART",
      "part": "forearm_far"
    },
    {
      "code": "OVERLAPPING_PARTS",
      "parts": ["head", "torso"]
    }
  ]
}
```

The generator retries with targeted corrections.

## 4. Morphology Agent

Chooses:

```text
humanoid
quadruped
arthropod
serpent
flyer
blob
radial
unknown
```

It may also produce:

```json
{
  "body_plan": "arthropod",
  "leg_count": 6,
  "segments_per_leg": 2,
  "confidence": 0.91
}
```

## 5. Extraction Agent

Runs:

- Segmentation
- Connected components
- Mask cleanup
- Cropping
- Transparent PNG export
- Part naming
- Joint-end detection

## 6. Rig Builder

Pure code, not an LLM:

- Loads the rig template
- Fits the part sprites
- Places pivots
- Constructs transform hierarchy
- Assigns sorting orders
- Attaches weapon sockets
- Applies the animation library

## 7. Animation Baker

For the video path:

- Runs motion transfer
- Extracts frames
- Removes background
- Stabilizes
- Selects frames
- Builds sprite sheet

For the puppet path:

- Applies normalized animation curves
- Generates Unity clips
- Optionally renders sprite-sheet versions

## 8. Animation QA Agent

Reviews a GIF or contact sheet and measures:

- Character identity drift
- Missing limbs
- Foot sliding
- Background residue
- Canvas jitter
- Loop seam
- Unexpected camera movement
- Broken weapon grip
- Major self-intersection

It either accepts the result or selects a recovery action.

---

# Recovery ladder

Every failure should have a cheaper fallback.

```text
Deformable puppet
    ↓ fails
Rigid cutout puppet
    ↓ fails
AI-baked sprite animation
    ↓ fails
Static sprite with procedural motion
```

That recovery ladder is what makes the factory truly automatic. It never gets stuck waiting for an artist.

## Example

A six-legged plasma beast fails part separation:

1. Retry the exploded atlas.
2. Retry with simpler anatomy.
3. Route to arthropod template.
4. If fitting fails, generate a walking video.
5. If the video mutates its legs, use one static image.
6. Animate the static image with body bobbing and six procedural leg sprites.
7. If even that fails, animate the whole body with squash, recoil and translation.

The result may be crude, but the pipeline always emits something usable.

---

# Unity output

Each completed character exports:

```text
Characters/
└── SectoidGrunt/
    ├── character.json
    ├── qa_report.json
    ├── preview.gif
    ├── Sprites/
    │   ├── parts.png
    │   ├── idle.png
    │   ├── run.png
    │   └── fire.png
    ├── Animations/
    │   ├── Idle.anim
    │   ├── Run.anim
    │   ├── Fire.anim
    │   ├── Hit.anim
    │   └── Death.anim
    ├── SectoidGrunt.controller
    └── SectoidGrunt.prefab
```

A Unity `AssetPostprocessor` can react when the generated textures and JSON arrive, configure the textures, slice sprite sheets, create animation clips, build an Animator Controller and produce the prefab. Unity exposes asset-import callbacks, including sprite postprocessing, specifically for automated import workflows.

Source: [Unity AssetPostprocessor documentation](https://docs.unity.cn/ScriptReference/AssetPostprocessor.html)

The runtime interface should be standardized:

```csharp
public interface IGeneratedCharacter
{
    void Move(float speed);
    void AimAt(Vector2 worldPosition);
    void AttackPrimary();
    void AttackSecondary();
    void TakeHit(Vector2 direction);
    void Die();
}
```

Whether a character uses a puppet or a sprite sheet should remain invisible to gameplay code.

---

# Recommended prototype version

Build the system in this order:

## Version 1: Universal sprite baker

Support:

- Canonical character generation
- Motion-reference selection
- AI video animation
- Background removal
- Stabilization
- Frame selection
- Sprite-sheet packing
- Unity import

Start with:

- Idle
- Run
- Attack
- Hit
- Death

This gets both humanoids and monsters into the game fastest.

## Version 2: Humanoid rigid puppet

Add:

- Humanoid exploded atlas
- Template skeleton
- Shared animation library
- Rifle aiming
- Weapon sockets
- Procedural recoil

Use it for soldiers and Sectoids.

## Version 3: Creature templates

Add in this order:

1. Blob
2. Serpent
3. Flyer
4. Quadruped
5. Arthropod
6. Radial creature

Blobs and serpents are particularly automation-friendly because their motion can be created almost entirely from procedural deformation.

## Version 4: Optional mesh deformation

Only introduce automatically generated meshes and weights after the rigid system works. SPRITETOMESH demonstrates that automatic mask-to-triangle-mesh generation for skeletal sprites is feasible, but rigid parts will be easier and more reliable for your initial prototype.

Source: [SPRITETOMESH paper](https://arxiv.org/abs/2602.21153)

# Bottom line

Your production system should be:

```text
AI designs the topology.
AI generates controlled assets.
Computer vision extracts and validates them.
Deterministic code rigs and packages them.
AI reviews the animated result.
A fallback ladder guarantees an output.
```

For this prototype, I would make **AI-generated sprite-sheet clips the universal baseline** and treat cutout rigs as an optimization for characters that need procedural aiming, weapon changes, or many reusable animations. That avoids making automatic rigging the bottleneck while still leaving you a path to more interactive characters later.
