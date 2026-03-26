# QtScrcpy-Plus

An enhanced fork of [QtScrcpy](https://github.com/barry-ran/QtScrcpy) focused on FPS game usability — with bounded mouse movement, dual-touch recentering, a flexible multi-eye system, and stable audio streaming.

**All changes are client-side only.** The scrcpy-server on the Android device is unchanged — no root, no APK installation, no device modification required.

---

## Why This Fork?

The original QtScrcpy maps mouse movement to a touch drag starting from `startPos`. That drag can travel across the entire screen with no bounds.

**The problem:** When the in-game UI changes suddenly (death screen, skill activation, new match), the internal touch position — which has drifted far from its starting point — may land on an interactive element in the new UI. This freezes mouse-look until the user manually resets by toggling the switch key, moving the mouse to an empty area, and toggling back.

**This fork solves it** by confining the touch drag to a configurable rectangle around `startPos`, with smooth automatic recentering when the boundary is reached.

```
┌─────────────── Phone Screen (0.05 – 0.95) ───────────────┐
│                                                           │
│              ┌──── Local Bounds ────┐                     │
│              │                      │                     │
│              │    · startPos        │  ← touch stays here │
│              │                      │                     │
│              └──────────────────────┘                     │
│           maxOffsetX ←─────→                              │
│                                                           │
│   [Kill Feed]    [HP Bar]     [Minimap]    [Weapon Slots] │
│                                                           │
│   After UI change, touch is still safely inside bounds    │
│   instead of sitting on a random button                   │
└───────────────────────────────────────────────────────────┘
```

---

## New Features

| Feature | Description |
|---------|-------------|
| [Bounded Movement](#1-bounded-mouse-movement) | Confines touch drag to a rectangle around `startPos` |
| [Recenter Delay](#2-recenter-delay) | Time-based gap control during single-touch recenter |
| [Dual-Touch Handoff](#3-dual-touch-handoff) | Zero-gap recenter using two alternating fingers |
| [Extra Eyes](#4-extra-eyes-system) | Multiple hold-to-activate anchors (Free Look, wheels, etc.) |
| [Audio Fix](#5-stable-audio-streaming) | Stutter-free sound via jitter buffer and thread safety |
| [Per-Pointer Dedup Fix](#6-per-pointer-touch-deduplication) | Critical multi-touch bug fix |

---

## Feature Guide

### 1. Bounded Mouse Movement

Add `maxOffsetX` and `maxOffsetY` to your `mouseMoveMap`:

```json
"mouseMoveMap": {
    "startPos": { "x": 0.463, "y": 0.424 },
    "speedRatioX": 5,
    "speedRatioY": 5,
    "maxOffsetX": 0.08,
    "maxOffsetY": 0.10
}
```

- `maxOffsetX: 0.08` → touch can move ±8% of screen width from `startPos.x`
- `maxOffsetY: 0.10` → touch can move ±10% of screen height from `startPos.y`
- Set both to `0` or omit them → original unbounded behavior

**Note:** A larger boundary area reduces the frequency of recentering resets, which decreases system load and ensures smoother continuous movement.

#### How Soft-Bounding Works

Unlike hard-clipping (which cuts input and loses data), Soft-Bounding delivers your full mouse movement to the game first, then recenters afterward:

1. Mouse delta is fully added to the internal touch position
2. Physical clamping at screen edges (0.05–0.95); overflow is preserved
3. Touch MOVE is sent to the device **immediately** (zero input loss)
4. **After** sending: if position is outside local bounds → recenter

The game always receives your exact input. Recentering is invisible housekeeping.

---

### 2. Recenter Delay

Controls the pause between lifting the old touch and placing a new one during single-touch recenter. This delay is tied to the number of frames your phone renders per second; for example, `16` is the exact duration of a single frame when the device outputs a stable 60fps.

```json
"recenterDelayMs": 16
```

| Value | Effect |
|-------|--------|
| `0` | Instant. Fastest response. May cause minor jitter on fast flicks |
| **`16`** | **Recommended.** One frame at 60fps. Best balance |
| `30` | Very safe. May feel slightly sluggish |

> Only applies when `dualTouchMode` is `"none"`. Dual-touch modes ignore this value.

---

### 3. Dual-Touch Handoff

Instead of a single touch lifting and dropping (which creates a gap in input), this feature uses two alternating fingers. As you reach the boundary, a new touch pointer is placed at the center before the old one is lifted, ensuring uninterrupted camera movement without any dead zones.

```json
"dualTouchMode": "clean"
```

| Mode | Behavior |
|------|----------|
| `"none"` | Single-touch recenter with `recenterDelayMs` (default) |
| `"clean"` | New finger DOWN, then old finger UP — same event |
| `"delayed"` | New finger DOWN now, old finger UP on next mouse event |
| `"overlap"` | New finger DOWN now, old finger MOVE+UP on next mouse event |

**Why 3 modes?** Touch event processing varies across different phones and game engines. Some games might ignore inputs or experience ghost touches with certain modes, so providing multiple options ensures compatibility. In practice, if supported, the three modes feel nearly identical because consecutive mouse events are ~1ms apart.

**Note:** If a game completely rejects all Dual-Touch modes (e.g., stopping camera movement entirely when the second finger drops), you must set this to `"none"` and configure a suitable `recenterDelayMs` instead.

**State safety:** `mouseMoveStopTouch()` acts as a garbage collector — when exiting mapped mode, all active and pending touches are cleaned up to prevent ghost touches.

---

### 4. Extra Eyes System

Replaces the old single `smallEyes` with an array of hold-to-activate anchors:

```json
"extraEyes": [
    {
        "key": "Key_Alt",
        "pos": { "x": 0.785, "y": 0.31 }
    },
    {
        "key": "Key_4",
        "pos": { "x": 0.653, "y": 0.936 },
        "maxOffsetX": 0.05,
        "maxOffsetY": 0.05
    }
]
```

#### Behaviors

- **Hold-to-activate** — active while key is held; on release returns to `startPos`
- **No reset/recenter ever** — uses Hard-Clamping (movement stops at boundary) to prevent camera teleport in absolute-position mechanics like Free Look
- **Unbounded by default** — `maxOffsetX/Y` at `0` or omitted → full screen (0.05–0.95)
- **Bounded if specified** — movement clamped within area around `eye.pos`

| Example | Bounds | Use Case |
|---------|--------|----------|
| `Key_Alt` | None (full screen) | Free Look — needs wide rotation |
| `Key_4` | `0.05 × 0.05` | Grenade/item wheel — precise selection |

---

### 5. Stable Audio Streaming

The original sndcpy integration suffered from constant stuttering due to:
- Cross-thread writes (unsafe `QIODevice::write()` from wrong thread)
- No jitter buffer (socket → audio device directly → constant underruns)
- Deadlock on Stop Audio (`BlockingQueuedConnection`)

**Fixed architecture:**

```
Socket (bursty) → QByteArray jitter buffer → QTimer drain (5ms) → Audio Device
                           ↑
                   Pre-buffer ~100ms before playback starts
                   Buffer size: 200ms (38400 bytes)
```

Result: continuous stutter-free audio with safe start/stop.

---

### 6. Per-Pointer Touch Deduplication

**Critical bug fix.** The original code used a single global `static QPoint` for MOVE deduplication across all touch pointers. This caused packet spam or dropped events when multiple touches were active simultaneously (e.g., WASD movement + mouse look).

Fixed by replacing with `QMap<int, QPoint>` keyed by touch pointer ID.

---

## Full JSON Reference

### `mouseMoveMap` fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `startPos` | {x, y} | — | Center position for mouse-to-touch mapping |
| `speedRatioX` | float | — | Sensitivity divisor for X axis |
| `speedRatioY` | float | — | Sensitivity divisor for Y axis |
| `maxOffsetX` | float | `0` | Horizontal bound radius (0 = unbounded) |
| `maxOffsetY` | float | `0` | Vertical bound radius (0 = unbounded) |
| `recenterDelayMs` | int | `0` | Delay in ms for single-touch recenter |
| `dualTouchMode` | string | `"none"` | `none` / `clean` / `delayed` / `overlap` |
| `extraEyes` | array | `[]` | Array of Eye objects (replaces `smallEyes`) |

### `extraEyes[]` fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `key` | string | ✅ | — | Qt key code for hold-to-activate |
| `pos` | {x, y} | ✅ | — | Anchor position |
| `maxOffsetX` | float | ❌ | `0` | Horizontal bound (0 = full screen) |
| `maxOffsetY` | float | ❌ | `0` | Vertical bound (0 = full screen) |

### Complete Example

```json
{
    "switchKey": "Key_QuoteLeft",
    "mouseMoveMap": {
        "type": "KMT_MOUSE_MOVE",
        "startPos": { "x": 0.463, "y": 0.424 },
        "speedRatioX": 5,
        "speedRatioY": 5,
        "maxOffsetX": 0.08,
        "maxOffsetY": 0.10,
        "recenterDelayMs": 16,
        "dualTouchMode": "clean",
        "extraEyes": [
            {
                "key": "Key_Alt",
                "pos": { "x": 0.785, "y": 0.31 }
            },
            {
                "key": "Key_4",
                "pos": { "x": 0.653, "y": 0.936 },
                "maxOffsetX": 0.05,
                "maxOffsetY": 0.05
            }
        ]
    },
    "keyMapNodes": [
        "... your key bindings ..."
    ],
    "width": 1920,
    "height": 876
}
```

---

## Recommendations

### Optimal Settings for PUBG Mobile

| Setting | Recommended | Why |
|---------|-------------|-----|
| `recenterDelayMs` | `16` | One frame at 60fps |
| `dualTouchMode` | `"clean"` | Safest zero-gap option |
| `speedRatioX/Y` | `4 – 6` | Moderate (see warning below) |
| Free Look eye | No bounds | Needs full rotation |
| Wheel eye | Small bounds (`0.05`) | Precise clamped selection |

### `startPos` Placement

Place `startPos` in a screen area that stays empty across all UI states:
- **Avoid** screen center — death screens, popups appear there
- **Good zone:** right-of-center, slightly above middle (e.g., `x: 0.65, y: 0.40`)
- Enable **Pointer Location** in Android Developer Options to visualize touches

### Sensitivity Warning

**Do not** use very high `speedRatio` values as a workaround for the drift problem.

High `speedRatio` divides mouse deltas (which are integers from the OS) by a large number. Small movements round to zero, and larger movements produce visible jumping instead of smooth motion (quantization). This is a fundamental limitation — not a bug.

Keep `speedRatio` moderate (4–6) and adjust in-game sensitivity to complement it.

### Backward Compatibility

- All new JSON fields are **optional**. Existing key mapping files work without modification.
- Old `smallEyes` JSON is recognized by the web editor and auto-converted to `extraEyes[0]`.

---

## ScrcpyKeyMapper (Web Editor)

A modified version of [ScrcpyKeyMapper](https://github.com/w4po/ScrcpyKeyMapper) is included in the `ScrcpyKeyMapper/` folder with full support for:

- Visual boundary rectangles (drag-to-resize)
- Independent Eye nodes with key binding
- Right-click to toggle boundaries
- All new `mouseMoveMap` fields in property panel
- `switchMap` hidden from irrelevant node types

In the release package, use `ScrcpyKeyMapper.lnk` to launch it locally (requires Python).

---

## Building from Source

The source code is in the `QtScrcpy-project/` folder.

### Prerequisites
- **Qt** 5.12+ (tested with Qt 5.15.2)
- **MSVC 2019** (Windows)

### Steps

1. Open `QtScrcpy-project/CMakeLists.txt` in Qt Creator
2. Select kit: Desktop Qt 5.15.2 MSVC2019 64-bit
3. Build Release (Ctrl+Shift+B)
4. Output appears in `output/x64/Release/`

For Linux build instructions, see the [original project](https://github.com/barry-ran/QtScrcpy#build).

---

## Modified Files

### QtScrcpy Core (C++)

| File | Changes |
|------|---------|
| `keymap.h` | `maxOffsetX`, `maxOffsetY`, `recenterDelayMs`, `dualTouchMode`, `ExtraEye` struct |
| `keymap.cpp` | Parsing for all new fields and `extraEyes` array |
| `inputconvertgame.h` | `activeEyeIndex`, `secondaryTouchActive`, `PendingTouch`, process flag |
| `inputconvertgame.cpp` | Soft-Bounding, dual-touch, extraEyes, per-pointer dedup, cleanup |
| `audiooutput.cpp` | Jitter buffer, timer drain, pre-buffer, thread safety, deadlock fix |

### ScrcpyKeyMapper (JavaScript)

| File | Changes |
|------|---------|
| `MouseMoveNode.js` | Boundary rect, new fields, removed smallEyes visual |
| `EyeNode.js` | New file — independent eye node |
| `NodeManager.js` | EyeNode registration |
| `ConfigManager.js` | Import/export extraEyes, backward compatibility |
| `index.html` | UI additions |

---

## Credits

This is a fork of [QtScrcpy](https://github.com/barry-ran/QtScrcpy) by [Barry](https://github.com/barry-ran), which is based on [scrcpy](https://github.com/Genymobile/scrcpy) by [Genymobile](https://github.com/Genymobile).

The web key mapping editor is based on [ScrcpyKeyMapper](https://github.com/w4po/ScrcpyKeyMapper) by [w4po](https://github.com/w4po).

## License

Licensed under the Apache License 2.0 — same as the original projects.