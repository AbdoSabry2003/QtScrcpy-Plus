# Changelog

All notable changes compared to the original [QtScrcpy](https://github.com/barry-ran/QtScrcpy).

## v1.0.0

### 🎮 Mouse Input

- **Bounded Mouse Movement** — `maxOffsetX` / `maxOffsetY` fields confine touch drag to a local rectangle around `startPos`, preventing drift across the screen during UI transitions
- **Soft-Bounding** — full mouse delta is sent first, recenter happens afterward (zero input loss)
- **Time-Based Recenter** — `recenterDelayMs` replaces the old `ignoreCount` with precise ms timing via `QTimer::singleShot`
- **Dual-Touch Handoff** — `dualTouchMode` enables zero-gap recenter using two alternating touch pointers (`none` / `clean` / `delayed` / `overlap`)
- **Extra Eyes** — `extraEyes` array replaces single `smallEyes` with unlimited hold-to-activate anchors, each with optional independent bounds and Hard-Clamping (no reset ever)

### 🐛 Bug Fixes

- **Per-Pointer Touch Dedup** — replaced global `static QPoint` with `QMap<int, QPoint>` to fix packet spam during simultaneous multi-touch
- **Ghost Touch Prevention** — `mouseMoveStopTouch()` now cleans up all active/pending touches

### 🔊 Audio (sndcpy)

- **Jitter Buffer** — intermediate `QByteArray` + `QTimer` drain (5ms) absorbs bursty network delivery
- **Pre-Buffer** — ~100ms buffered before playback starts
- **Buffer Size** — increased to 200ms (38400 bytes)
- **Thread Safety** — fixed cross-thread `QIODevice::write()`
- **Deadlock Fix** — removed `BlockingQueuedConnection`; uses `quit()` + `wait()`
- **Memory Fix** — `QVector::resize()` instead of `reserve()`

### 🌐 ScrcpyKeyMapper (Web Editor)

- Added `maxOffsetX`, `maxOffsetY`, `recenterDelayMs`, `dualTouchMode` fields
- Visual boundary rectangles with drag-to-resize handles
- Independent `EyeNode` with key binding and boundary support
- Right-click toggle for boundaries
- Hidden `switchMap` from irrelevant node types
- Fixed boundary rendering after JSON import
- Backward compatibility: `smallEyes` auto-converts to `extraEyes[0]`