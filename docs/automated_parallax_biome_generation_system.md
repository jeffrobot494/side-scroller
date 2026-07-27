---
status: plan
tags: [assets, parallax]
---

# Automated Parallax Biome Generation System

## 1. Document Purpose

This document specifies an automated system that converts a natural-language environment description into a Unity-ready, multi-layer parallax background package for a 2D side-scrolling game.

The system is intended for rapid prototyping. It prioritizes automation, speed, visual coherence, and guaranteed usable output over production-quality art.

Example input:

> American city streets at night, broken-down cars, broken windows, abandoned buildings, cloudy sky, skyscrapers in the background.

Example output:

- Five parallax background layers
- Seamlessly looping distant panoramas
- Procedurally assembled near-background strips
- Modular foreground prop sprites
- Layer scroll-speed configuration
- Unity materials, prefabs, and import metadata
- Preview image and quality-assurance report

---

## 2. Goals

The system must:

1. Accept a short natural-language description of a biome or environment.
2. Interpret the description as a layered side-scrolling scene.
3. Generate a coherent visual style for the entire biome.
4. Produce five or more depth-separated parallax layers.
5. Allocate more visual assets and variation to faster-scrolling layers.
6. Create horizontally repeatable environments.
7. Generate modular props where full-strip generation would be inefficient.
8. Detect and repair common generation failures.
9. Export assets in a form that Unity can import automatically.
10. Always return at least a minimally usable environment.

The ideal user workflow is:

```text
Enter environment prompt
        ↓
Select or accept defaults
        ↓
Run generation
        ↓
Receive Unity-ready biome prefab
```

---

## 3. Non-Goals

The initial system is not intended to:

- Generate complete playable level geometry
- Create collision meshes for all visual objects
- Replace hand-authored final environment art
- Guarantee flawless seamless tiling from a single generation
- Produce accurate real-world architecture
- Generate indoor and outdoor environments in the same pass
- Infer gameplay-critical platforms from background artwork
- Create foreground objects that obscure gameplay without restrictions
- Produce unlimited biome length as one monolithic texture

Gameplay geometry, platforms, cover objects, and interactive props should remain separate from decorative parallax art unless a later system explicitly links them.

---

## 4. Core Design Principle

Different parallax layers should use different asset-generation strategies.

Distant layers contain broad, slowly changing visual forms. They require relatively little horizontal variation and can be generated as panoramic strips.

Near layers move faster across the screen. Repetition becomes more visible, so these layers require more assets and should be assembled from modular pieces.

The recommended strategy is:

> Generate panoramic strips for distant layers and modular asset kits for near layers.

Default allocation:

| Layer | Typical Content | Generation Strategy | Relative Asset Count |
|---|---|---|---:|
| 1 | Sky and atmosphere | Seamless panorama | Very low |
| 2 | Distant horizon or skyline | Seamless panorama | Low |
| 3 | Midground structures | Panorama or large chunks | Medium |
| 4 | Near architecture | Modular composition | High |
| 5 | Foreground props | Modular composition | Very high |

This hybrid strategy provides better variation, easier repair, and lower generation cost than treating every layer as a complete independent image.

---

## 5. System Overview

```text
Natural-language environment prompt
                  ↓
       Environment Planning Agent
                  ↓
          Biome Specification
                  ↓
        Style Anchor Generation
                  ↓
          Style QA and Approval
                  ↓
       Per-Layer Asset Generation
                  ↓
    ┌─────────────┴─────────────┐
    ↓                           ↓
Panorama Pipeline        Modular Asset Pipeline
    ↓                           ↓
Seam Repair              Asset Extraction
    ↓                           ↓
    └─────────────┬─────────────┘
                  ↓
       Procedural Strip Composer
                  ↓
     Palette and Depth Harmonizer
                  ↓
        Parallax Preview Renderer
                  ↓
          Automated QA Agent
                  ↓
      Repair, Regenerate, or Accept
                  ↓
         Unity Export Pipeline
                  ↓
       Ready-to-use Biome Prefab
```

---

## 6. User Input

### 6.1 Minimum Input

The only required input is an environment prompt.

Example:

```text
American city streets at night, broken-down cars, broken windows,
abandoned buildings, cloudy sky, skyscrapers in the background.
```

### 6.2 Optional Input

The system may accept additional configuration:

```json
{
  "prompt": "American city streets at night...",
  "layer_count": 5,
  "target_resolution": {
    "width": 1920,
    "height": 1080
  },
  "art_style": "polished 2D vector art",
  "camera": "fixed side view",
  "tile_width": 4096,
  "foreground_density": 0.65,
  "mood": "tense and abandoned",
  "time_of_day": "night",
  "weather": "cloudy",
  "allow_animation": true,
  "seed": 283771
}
```

All optional values should have safe defaults.

---

## 7. Environment Specification

The Environment Planning Agent converts the user’s prompt into a structured `BiomeSpec`.

Example:

```json
{
  "schema_version": "1.0",
  "biome_id": "abandoned_city_night",
  "display_name": "Abandoned City at Night",
  "source_prompt": "American city streets at night, broken-down cars...",
  "camera": {
    "projection": "orthographic",
    "view": "side",
    "horizon_y": 0.58
  },
  "style": {
    "description": "polished 2D side-scrolling game environment",
    "detail_level": "medium",
    "outline_style": "subtle crisp outlines",
    "texture_style": "limited painterly texture",
    "lighting": "night lighting with dim artificial highlights"
  },
  "mood": [
    "abandoned",
    "tense",
    "quiet",
    "post-disaster"
  ],
  "palette": {
    "dominant": [
      "deep blue",
      "blue gray",
      "charcoal"
    ],
    "secondary": [
      "muted yellow",
      "rust red"
    ],
    "effects": [
      "faint green",
      "orange firelight"
    ]
  },
  "layers": [
    {
      "id": "sky",
      "depth_index": 0,
      "type": "panorama",
      "scroll_factor": 0.04,
      "content": [
        "heavy clouds",
        "haze",
        "subtle moon glow"
      ],
      "detail_density": 0.1
    },
    {
      "id": "far_skyline",
      "depth_index": 1,
      "type": "panorama",
      "scroll_factor": 0.1,
      "content": [
        "distant skyscrapers",
        "roof antennas",
        "water towers"
      ],
      "detail_density": 0.2
    },
    {
      "id": "mid_buildings",
      "depth_index": 2,
      "type": "chunked_panorama",
      "scroll_factor": 0.22,
      "content": [
        "abandoned apartment blocks",
        "dark windows",
        "fire escapes",
        "rooftop equipment"
      ],
      "detail_density": 0.4
    },
    {
      "id": "near_architecture",
      "depth_index": 3,
      "type": "modular_strip",
      "scroll_factor": 0.45,
      "content": [
        "broken storefronts",
        "boarded windows",
        "alley walls",
        "pipes",
        "signs"
      ],
      "detail_density": 0.7
    },
    {
      "id": "foreground_props",
      "depth_index": 4,
      "type": "modular_strip",
      "scroll_factor": 0.72,
      "content": [
        "wrecked cars",
        "streetlights",
        "dumpsters",
        "barriers",
        "rubble",
        "fences"
      ],
      "detail_density": 1.0
    }
  ]
}
```

The `BiomeSpec` is the authoritative description used by all later agents and processing stages.

---

## 8. Style Anchor

### 8.1 Purpose

Before generating individual layers, the system creates a single wide concept image called the **style anchor**.

The style anchor defines:

- Color palette
- Architectural vocabulary
- Lighting direction
- Atmospheric conditions
- Shape language
- Level of detail
- Degree of damage or decay
- Visual contrast between depth ranges

It is not imported directly as a gameplay layer.

### 8.2 Generation Requirements

The style anchor prompt should request:

- Wide side-view composition
- The full intended environment
- Representative examples of near and far structures
- No gameplay UI
- No characters unless explicitly requested
- No perspective that conflicts with a side-scrolling camera
- Clear foreground, midground, and background separation

### 8.3 Style Anchor QA

A vision agent evaluates:

- Whether the image matches the source prompt
- Whether the side-view camera is usable
- Whether the palette is coherent
- Whether foreground and background are visually separable
- Whether architectural and natural forms are consistent
- Whether the image contains undesirable dominant objects
- Whether the scene is appropriate for parallax decomposition

If it fails, the system regenerates the style anchor before spending resources on the remaining assets.

---

## 9. Layer Generation

### 9.1 Layer 1: Sky and Atmosphere

Typical contents:

- Clouds
- Fog
- Haze
- Moon glow
- Stars
- Distant precipitation
- Atmospheric color gradients

Generation strategy:

- One or two very wide panoramic strips
- Low detail
- Low contrast
- No foreground silhouettes
- Horizontally tileable
- Optional separate cloud overlays

Recommended width:

```text
2048–4096 pixels
```

Because this layer scrolls slowly, obvious repetition is less likely.

Optional animated components:

- Slowly translating cloud strip
- Fog overlay
- Rain sheet
- Light flicker from distant storms

### 9.2 Layer 2: Far Horizon or Skyline

Typical contents:

- Skyscraper silhouettes
- Mountains
- Distant forest
- Industrial stacks
- Radio towers
- Water towers
- Faint window lights

Generation strategy:

- Seamless panoramic strip
- Strong silhouette
- Reduced contrast
- Atmospheric haze applied
- Minimal small detail
- No objects extending into the near foreground

Recommended width:

```text
4096 pixels
```

Two or three variants may be generated and alternated to reduce repetition.

### 9.3 Layer 3: Midground Structures

Typical contents:

- Apartment blocks
- Rooftops
- Warehouses
- Mid-distance trees
- Bridges
- Large signs
- Fire escapes
- Rooftop machinery

Generation strategy:

- Wide strip, or
- Three to eight large environmental chunks

Chunk-based generation is preferred when the image model struggles with seamless panoramas.

Example chunks:

```text
mid_apartment_block_01
mid_warehouse_roofs_01
mid_ruined_offices_01
mid_alley_gap_01
mid_rooftop_water_tower_01
```

The composer joins these chunks with overlaps, masks, haze, and connector pieces.

### 9.4 Layer 4: Near Architecture

Typical contents:

- Storefronts
- Building facades
- Doors
- Broken windows
- Boarded windows
- Alleys
- Fire escapes
- Pipes
- Air-conditioning units
- Neon signs
- Balconies
- Rooftop edges

Generation strategy:

- Modular transparent or keyed assets
- Large facade pieces
- Overlay details
- Connector pieces
- Automated composition into a long strip

Suggested initial kit:

| Asset Category | Variant Count |
|---|---:|
| Storefront facades | 5 |
| Residential facades | 4 |
| Industrial facades | 3 |
| Alley connectors | 3 |
| Window overlays | 8 |
| Door overlays | 5 |
| Fire escapes | 4 |
| Signage | 8 |
| Pipe and utility clusters | 6 |
| Rooftop transitions | 4 |

The architecture composer may layer detail sprites over base facades to create additional variants without generating entirely new buildings.

### 9.5 Layer 5: Foreground Props

Typical contents:

- Wrecked cars
- Dumpsters
- Barriers
- Streetlights
- Fences
- Traffic signs
- Rubble
- Trash piles
- Crates
- Newspaper boxes
- Utility poles
- Bushes or weeds

Generation strategy:

- Isolated sprites
- Transparent backgrounds
- Multiple variants
- Procedural placement
- Controlled horizontal mirroring
- Optional palette variants

Suggested initial kit:

| Asset Category | Variant Count |
|---|---:|
| Cars and trucks | 8–12 |
| Rubble piles | 8 |
| Barriers | 4 |
| Streetlights | 4 |
| Dumpsters | 4 |
| Signs | 8 |
| Fence sections | 5 |
| Trash and debris clusters | 10 |
| Utility props | 6 |

The foreground layer receives the greatest number of assets because it moves fastest and makes repetition most noticeable.

---

## 10. Asset Generation Requirements

Every generated asset should include metadata describing its intended use.

Example:

```json
{
  "asset_id": "wrecked_sedan_03",
  "category": "vehicle",
  "layer": "foreground_props",
  "dimensions": {
    "width": 612,
    "height": 284
  },
  "anchor": {
    "type": "ground_center",
    "x": 0.5,
    "y": 0.94
  },
  "can_mirror": true,
  "scale_range": [
    0.9,
    1.1
  ],
  "minimum_spacing": 420,
  "maximum_repeats_per_strip": 2,
  "tags": [
    "wrecked",
    "urban",
    "low-profile"
  ]
}
```

The system should generate metadata automatically through a combination of:

- Known prompt intent
- Mask dimensions
- Visual classification
- Ground-contact detection
- Agent verification

---

## 11. Panorama Processing Pipeline

Generated panoramic images should pass through the following deterministic process:

```text
Generate oversized panorama
        ↓
Crop to target height
        ↓
Detect horizon and baseline
        ↓
Normalize palette
        ↓
Test left/right seam
        ↓
Repair seam
        ↓
Re-test tiling
        ↓
Export accepted panorama
```

### 11.1 Seam Detection

The system places two copies of the panorama side by side and measures:

- Pixel difference near the boundary
- Edge color discontinuity
- Silhouette discontinuity
- Sudden horizon shifts
- Object truncation

### 11.2 Seam Repair

Repair strategies, in order:

1. Crossfade a narrow seam area.
2. Use texture synthesis to blend the boundary.
3. Outpaint both edges together.
4. Crop a different internal region.
5. Regenerate the panorama with stricter tiling instructions.

The seam should also be reviewed visually by a QA agent.

---

## 12. Modular Asset Extraction

For transparent asset sheets, the extraction pipeline is:

```text
Generated asset atlas
        ↓
Background segmentation
        ↓
Connected-component detection
        ↓
Object separation
        ↓
Mask cleanup
        ↓
Crop and padding
        ↓
Ground-anchor detection
        ↓
Asset classification
        ↓
Metadata generation
        ↓
QA
```

The system should prefer generating assets with generous spacing between objects. This makes connected-component extraction more reliable and reduces dependence on sophisticated semantic segmentation.

When two assets overlap, the system may:

- Attempt semantic separation
- Crop and regenerate only the affected asset
- Reject the atlas and request a better-spaced version

---

## 13. Procedural Strip Composer

The composer assembles modular assets into long scrolling strips.

It should be deterministic when given the same:

- Asset library
- Biome specification
- Random seed
- Strip width
- Density settings

### 13.1 Composer Responsibilities

The composer controls:

- Asset selection
- Horizontal placement
- Vertical anchoring
- Layer ordering
- Scale variation
- Mirroring
- Overlap
- Density
- Repetition
- Empty-space rhythm
- Connector placement
- Decorative overlays

### 13.2 Example Composition Rules

```json
{
  "strip_width": 8192,
  "target_density": 0.67,
  "minimum_empty_interval": 160,
  "maximum_empty_interval": 900,
  "mirror_probability": 0.3,
  "scale_variation": 0.08,
  "maximum_identical_asset_uses": 2,
  "minimum_repeat_distance": 1800,
  "allow_overlap": true,
  "maximum_overlap_ratio": 0.15
}
```

### 13.3 Placement Constraints

Examples:

- Cars must remain aligned to the ground baseline.
- Signs may overlap building facades but not other signs.
- Rubble may overlap vehicles slightly.
- Fire escapes must attach to compatible facades.
- Foreground props should not cover more than a configured percentage of the player-visible area.
- Tall objects should not cluster so densely that they create repeated vertical walls.
- Mirrored text-bearing signs are prohibited.
- Major assets should not appear near both ends of a looping strip if doing so makes repetition obvious.

### 13.4 Composition Grammar

The system may use a simple grammar:

```text
Street Segment
→ Building Cluster
→ Gap
→ Prop Cluster
→ Building Cluster
→ Landmark
→ Sparse Segment
→ Prop Cluster
```

A more detailed urban grammar could be:

```text
Building Cluster
→ Base Facade
+ Window Overlay
+ Door Overlay
+ Optional Sign
+ Optional Fire Escape
+ Optional Utility Cluster
```

This multiplies the useful variation produced from a relatively small asset kit.

---

## 14. Anti-Repetition System

The composer should actively minimize recognizable repetition.

Techniques include:

- Minimum repeat distance
- Asset cooldowns
- Narrow scale variation
- Horizontal mirroring where safe
- Overlay substitutions
- Palette variants
- Alternate damage overlays
- Empty-space variation
- Landmark limits
- Randomized prop clusters
- Multiple panorama variants
- Chunk-order shuffling

Text, logos, asymmetric directional symbols, and objects with strong lighting direction must not be mirrored automatically.

The system should calculate a simple repetition score based on:

- Reused asset frequency
- Distance between duplicates
- Similar neighboring arrangements
- Repeated silhouettes
- Repeated landmark patterns

If the score exceeds a threshold, the composer should rebuild the strip using a new seed or request additional assets.

---

## 15. Depth and Style Harmonization

Assets generated separately may have inconsistent contrast, saturation, edge sharpness, or lighting.

A harmonization pass should normalize the biome.

### 15.1 Depth-Based Rules

| Layer | Contrast | Saturation | Detail | Atmospheric Haze |
|---|---:|---:|---:|---:|
| Sky | Very low | Low | Very low | High |
| Far skyline | Low | Low | Low | High |
| Midground | Medium-low | Medium-low | Medium | Medium |
| Near architecture | Medium-high | Medium | High | Low |
| Foreground | High | Medium-high | High | Minimal |

### 15.2 Processing Operations

Possible deterministic operations:

- Histogram matching
- Palette quantization
- Saturation adjustment
- Contrast adjustment
- Haze overlay
- Sharpness control
- Shadow tinting
- Outline-strength normalization
- Global color grading
- Optional LUT application

The style anchor supplies the target palette and contrast hierarchy.

---

## 16. Optional Animated Layers

The first version may use static layers only. Later versions may support subtle environmental animation.

Examples:

- Moving cloud bands
- Drifting fog
- Flickering signs
- Blinking building lights
- Rain
- Snow
- Smoke columns
- Distant fire
- Floating ash
- Passing spotlights

Animated elements should generally be exported separately from the base layers so their speed, timing, and visibility can be controlled independently.

Example:

```json
{
  "animated_element": "neon_sign_flicker_01",
  "parent_layer": "near_architecture",
  "animation_type": "sprite_sequence",
  "loop": true,
  "random_start_time": true,
  "activation_probability": 0.6
}
```

---

## 17. Agent Architecture

Agents should handle interpretation and visual judgment. Deterministic code should handle image processing, layout, file creation, and Unity asset construction.

### 17.1 Environment Planning Agent

Input:

- User prompt
- Optional settings

Output:

- `BiomeSpec`
- Layer definitions
- Asset-count targets
- Style-anchor prompt
- Per-layer generation prompts

Responsibilities:

- Interpret the environment
- Separate requested content by depth
- Add sensible supporting details
- Avoid placing every requested object on every layer
- Choose panorama or modular generation for each layer

### 17.2 Style Director Agent

Responsibilities:

- Create a concise visual-language specification
- Extract a palette from the style anchor
- Define lighting direction
- Define contrast hierarchy
- Maintain consistency between generation prompts

Output:

```json
{
  "palette": {},
  "lighting": {},
  "shape_language": {},
  "material_language": {},
  "damage_language": {},
  "layer_rendering_rules": {}
}
```

### 17.3 Asset Prompt Agent

Responsibilities:

- Produce prompts for each panorama, chunk, and asset atlas
- Preserve camera, style, lighting, and scale consistency
- Specify transparent or flat backgrounds where necessary
- Prevent perspective drift
- Request safe spacing between atlas objects

### 17.4 Visual QA Agent

Checks:

- Prompt compliance
- Camera consistency
- Style consistency
- Layer suitability
- Cropped objects
- Unwanted text
- Perspective mismatch
- Scale mismatch
- Floating objects
- Incomplete transparency
- Poor silhouette readability

Output:

```json
{
  "passed": false,
  "score": 0.71,
  "errors": [
    {
      "code": "PERSPECTIVE_MISMATCH",
      "severity": "high",
      "asset": "storefront_atlas_02"
    },
    {
      "code": "CROPPED_OBJECT",
      "severity": "medium",
      "asset": "wrecked_car_04"
    }
  ],
  "recommended_action": "regenerate_selected_assets"
}
```

### 17.5 Composition Agent

The composition agent may evaluate completed strips, but it should not directly place every asset through free-form language reasoning.

Deterministic code performs the placement. The agent reviews:

- Visual rhythm
- Repetition
- Implausible adjacency
- Excessive clutter
- Empty areas
- Landmark distribution
- Prompt fidelity

It may adjust high-level composition parameters and request a deterministic rebuild.

### 17.6 Export Agent

Responsibilities:

- Validate file completeness
- Produce Unity-compatible metadata
- Generate a manifest
- Trigger the Unity import process
- Verify that the prefab was built successfully
- Produce a final preview and report

---

## 18. Automated Quality Assurance

QA occurs at four levels.

### 18.1 Asset-Level QA

Checks individual files for:

- Transparency
- Cropping
- Resolution
- Unexpected backgrounds
- Correct category
- Visual defects
- Camera consistency

### 18.2 Layer-Level QA

Checks each completed strip for:

- Tiling
- Horizon continuity
- Density
- Style coherence
- Repetition
- Empty-space distribution
- Layer-appropriate detail

### 18.3 Full-Scene QA

The system renders all layers together using their intended parallax speeds.

It checks:

- Depth readability
- Foreground obstruction
- Scale relationships
- Conflicting horizons
- Color separation
- Visible repetition
- Motion coherence
- Whether the scene still matches the original prompt

### 18.4 Unity Validation

Checks:

- Textures imported
- Transparency preserved
- Pixels-per-unit set
- Materials assigned
- Prefab created
- Layers ordered correctly
- Parallax speeds loaded
- Looping works during camera movement
- No missing references

---

## 19. Failure Recovery

The pipeline should never stop permanently because one asset or layer failed.

Recovery should proceed from highest quality to cheapest usable fallback.

```text
Preferred generated asset
        ↓ fails
Regenerate selected asset
        ↓ fails
Simplify prompt
        ↓ fails
Use alternate generated candidate
        ↓ fails
Reuse compatible library asset
        ↓ fails
Use silhouette placeholder
```

### 19.1 Panorama Recovery

```text
Seamless generated panorama
        ↓
Oversized panorama with seam repair
        ↓
Chunk-based composition
        ↓
Simple procedural gradient and silhouettes
```

### 19.2 Modular Asset Recovery

```text
Transparent generated asset
        ↓
Flat-background asset with segmentation
        ↓
Simplified silhouette asset
        ↓
Compatible generic prop from shared library
```

### 19.3 Full-Biome Recovery

If generation broadly fails, the system may still produce:

- Gradient sky
- Procedurally generated skyline silhouettes
- Recolored generic building chunks
- Shared debris and prop sprites
- Valid parallax configuration
- Unity prefab

The result may be visually generic, but the system always returns a functioning environment.

---

## 20. Shared Asset Library

Generated assets should not be discarded after a single biome.

The system should maintain a searchable library containing:

- Asset image
- Mask
- Metadata
- Source biome
- Prompt
- Style embedding
- Category
- Perspective
- Lighting direction
- Dominant palette
- Reuse permissions
- Quality score

Potentially reusable assets include:

- Clouds
- Distant skylines
- Mountains
- Trees
- Rocks
- Vehicles
- Streetlights
- Fences
- Barriers
- Debris
- Generic building facades

When generating a new biome, the planning system may reuse compatible library assets before requesting new generations.

This reduces:

- Generation cost
- Pipeline latency
- Style inconsistency
- Duplicate assets

Reused assets should still pass through palette harmonization.

---

## 21. Unity Integration

### 21.1 Output Structure

```text
Assets/
└── GeneratedBiomes/
    └── AbandonedCityNight/
        ├── biome_spec.json
        ├── biome_manifest.json
        ├── qa_report.json
        ├── preview_static.png
        ├── preview_parallax.gif
        ├── Textures/
        │   ├── sky_01.png
        │   ├── far_skyline_01.png
        │   ├── mid_buildings_01.png
        │   ├── near_architecture_01.png
        │   └── foreground_props_01.png
        ├── SourceAssets/
        │   ├── Facades/
        │   ├── Vehicles/
        │   ├── Debris/
        │   ├── Signs/
        │   └── Utilities/
        ├── Materials/
        ├── Prefabs/
        │   └── AbandonedCityNight_Parallax.prefab
        └── Scenes/
            └── AbandonedCityNight_Preview.unity
```

### 21.2 Unity Importer Responsibilities

A Unity editor script should:

1. Detect a new biome manifest.
2. Configure texture import settings.
3. Preserve alpha channels.
4. Set pixels per unit.
5. Disable unwanted texture compression when necessary.
6. Create materials.
7. Create layer GameObjects.
8. Assign sorting layers and orders.
9. Add parallax movement components.
10. Configure looping renderers.
11. Build the biome prefab.
12. Generate a preview scene.
13. Report missing or invalid assets.

### 21.3 Example Layer Configuration

```json
{
  "layers": [
    {
      "id": "sky",
      "texture": "Textures/sky_01.png",
      "scroll_factor": 0.04,
      "z_position": 50,
      "sorting_order": 0,
      "loop": true
    },
    {
      "id": "far_skyline",
      "texture": "Textures/far_skyline_01.png",
      "scroll_factor": 0.1,
      "z_position": 40,
      "sorting_order": 10,
      "loop": true
    },
    {
      "id": "mid_buildings",
      "texture": "Textures/mid_buildings_01.png",
      "scroll_factor": 0.22,
      "z_position": 30,
      "sorting_order": 20,
      "loop": true
    },
    {
      "id": "near_architecture",
      "texture": "Textures/near_architecture_01.png",
      "scroll_factor": 0.45,
      "z_position": 20,
      "sorting_order": 30,
      "loop": true
    },
    {
      "id": "foreground_props",
      "texture": "Textures/foreground_props_01.png",
      "scroll_factor": 0.72,
      "z_position": 10,
      "sorting_order": 40,
      "loop": true
    }
  ]
}
```

Gameplay code should not need to know whether a layer was directly generated or procedurally composed.

---

## 22. Runtime Parallax Behavior

A simple runtime component computes each layer’s position relative to the camera.

Conceptually:

```text
layer offset = camera displacement × scroll factor
```

Recommended conventions:

- `0.0`: visually fixed relative to the camera
- `0.1`: very distant
- `0.25`: mid-distance
- `0.5`: near background
- `0.75`: foreground
- `1.0`: moves at world speed

The runtime system should:

- Reposition looping copies before gaps become visible
- Support camera movement in both directions
- Preserve vertical offsets
- Optionally support vertical parallax
- Allow layer-specific animation
- Avoid accumulating floating-point drift during long play sessions

---

## 23. Example: Abandoned American City at Night

Input:

```text
American city streets at night, broken-down cars, broken windows,
abandoned buildings, cloudy sky, skyscrapers in the background.
```

Generated interpretation:

### Layer 1: Cloudy Night Sky

- Heavy cloud cover
- Faint moon glow
- Blue-gray haze
- Optional slow cloud movement

### Layer 2: Distant Skyline

- Skyscraper silhouettes
- Antennas
- Water towers
- Sparse yellow window lights
- Atmospheric haze

### Layer 3: Midground Buildings

- Abandoned apartments
- Industrial rooftops
- Fire escapes
- Dark windows
- Rooftop machinery

### Layer 4: Near Architecture

- Broken storefronts
- Cracked walls
- Boarded windows
- Alley openings
- Neon remnants
- Pipes and utility boxes

### Layer 5: Foreground Props

- Wrecked sedans
- Overturned vehicle
- Streetlights
- Concrete barriers
- Dumpsters
- Traffic signs
- Rubble
- Chain-link fencing

Possible optional animated overlays:

- Flickering neon sign
- Drifting smoke
- Distant fire
- Moving clouds
- Loose papers crossing the street

---

## 24. Implementation Phases

### Phase 1: Direct Panorama Prototype

Implement:

- Prompt-to-`BiomeSpec`
- Five direct strip generations
- Basic seam repair
- Parallax preview
- Unity prefab export

Purpose:

- Validate the complete end-to-end workflow
- Accept lower visual quality
- Avoid modular composition initially

Success criterion:

> A single prompt produces a functional five-layer parallax prefab without manual intervention.

### Phase 2: Hybrid Layer Generation

Add:

- Style-anchor generation
- Modular near-architecture kit
- Modular foreground prop kit
- Asset extraction
- Procedural strip composer
- Anti-repetition rules

Purpose:

- Improve foreground variation
- Reduce visible repetition
- Allow selective regeneration

### Phase 3: Automated QA and Repair

Add:

- Visual asset QA
- Seam-quality scoring
- Repetition scoring
- Full-scene parallax preview
- Automated regeneration
- Failure recovery ladder

Purpose:

- Reduce malformed or unusable outputs
- Make unattended generation reliable

### Phase 4: Shared Asset Library

Add:

- Asset indexing
- Semantic search
- Style similarity matching
- Cross-biome reuse
- Automatic recoloring and harmonization

Purpose:

- Reduce generation cost
- Improve output speed
- Build a growing reusable environment library

### Phase 5: Animated Environmental Elements

Add:

- Cloud motion
- Fog
- Rain
- Smoke
- Fire
- Flickering signs
- Particle overlays
- Unity animation setup

Purpose:

- Increase environment life and depth
- Retain automatic generation and export

---

## 25. Minimum Viable Product

The recommended MVP includes:

### User-Facing Functionality

- One text input
- Generate button
- Optional random seed
- Optional five-layer preview
- Unity export

### System Functionality

- Prompt-to-`BiomeSpec`
- One style anchor
- Three panorama layers
- One modular architecture layer
- One modular foreground layer
- Basic seam repair
- Simple composition rules
- Automated Unity import
- Static preview and QA report

### Initial Supported Environment Categories

- Urban streets
- Industrial zones
- Forest
- Desert
- Snowfield
- Swamp
- Alien landscape
- Ruined city
- Underground cavern

These categories should be treated as prompt presets rather than hard limitations.

---

## 26. Acceptance Criteria

A generated biome is accepted when:

1. All configured layers exist.
2. Every image has the expected dimensions.
3. Required transparency is present.
4. Panoramic seams pass the configured threshold.
5. Layer order is valid.
6. The visible horizon does not jump significantly between layers.
7. Foreground density remains within limits.
8. Repetition score is below the configured threshold.
9. The final composite broadly matches the input prompt.
10. The Unity prefab imports without missing references.
11. The environment loops during horizontal camera movement.
12. No gap appears during the automated preview test.

Visual perfection is not required. Functional usability and prompt recognizability are the primary acceptance standards.

---

## 27. Principal Risks

### Inconsistent Art Style

Mitigation:

- Generate and enforce a style anchor
- Use palette harmonization
- Reuse assets within a biome
- Regenerate only outlier assets

### Perspective Drift

Mitigation:

- Require orthographic side-view prompts
- Reject assets with strong perspective
- Use broad silhouettes for distant layers
- Prefer modular facade pieces with straight baselines

### Poor Transparency

Mitigation:

- Generate against flat key backgrounds
- Run segmentation
- Clean masks deterministically
- Regenerate assets with contaminated edges

### Obvious Repetition

Mitigation:

- Increase asset counts for fast layers
- Use cooldown rules
- Apply overlays
- Rebuild with a new seed
- Request additional variants

### Bad Seamless Tiling

Mitigation:

- Generate oversized strips
- Repair seams
- Use chunk-based composition
- Fall back to procedural silhouettes

### Foreground Interferes With Gameplay

Mitigation:

- Reserve visibility zones
- Limit maximum object height
- Generate gameplay-safe previews
- Keep interactive level geometry separate

### Generation Cost

Mitigation:

- Cache all outputs
- Reuse shared assets
- Generate low-resolution candidates first
- Upscale only accepted assets
- Regenerate only failed components

---

## 28. Final Recommendation

The first implementation should use the following architecture:

```text
Prompt
→ Environment Planning Agent
→ BiomeSpec
→ Style Anchor
→ Three Distant Panorama Layers
→ Near-Architecture Asset Kit
→ Foreground Prop Kit
→ Procedural Strip Composer
→ Depth and Palette Harmonization
→ Automated QA
→ Unity Importer
→ Parallax Prefab
```

The system should avoid depending on perfect image generation. Reliability comes from:

- Structured environment planning
- Different strategies for different depths
- Modular assets in fast layers
- Deterministic composition
- Automated visual review
- Layer-specific regeneration
- Guaranteed fallbacks

The core rule is:

> Use AI to decide what the environment contains and to create its visual components. Use deterministic software to assemble, validate, loop, and export the final biome.

This division of responsibilities provides the fastest path to consistently generating usable parallax environments for a game prototype.
