---
module: XR8.MediaRecorder
source: https://www.8thwall.com/docs/api/engine/api/engine/mediarecorder
updated: 2026-07-21
---

# XR8.MediaRecorder

Camera pipeline module that records the AR experience to an MP4 video, with an
optional per-frame canvas overlay. Not currently used by this repo (near-neighbor
for a "record clip" feature).

## Methods

### `XR8.MediaRecorder.pipelineModule()`
`pipelineModule(): CameraPipelineModule` — Install to enable recording.

### `XR8.MediaRecorder.recordVideo(callbacks)`
`recordVideo({ onStart?, onStop?, onError?, onProcessFrame?, onPreviewReady?, onFinalizeProgress?, onVideoReady? }): void`

Start recording. Callbacks:
- `onStart()` — recording started.
- `onStop()` — recording stopped.
- `onError()` — an error occurred.
- `onProcessFrame({ elapsedTimeMs, maxRecordingMs, ctx })` — draw an overlay onto
  the video via the 2D `ctx`.
- `onVideoReady(result)` — final video ready.
- `onPreviewReady()` — previewable (not sharing-optimized) video ready
  (Android/Desktop, where webm converts to mp4).
- `onFinalizeProgress({ progress, total })` — export progress during conversion.

```ts
XR8.MediaRecorder.recordVideo({
  onVideoReady: (result) =>
    window.dispatchEvent(new CustomEvent('recordercomplete', { detail: result })),
  onProcessFrame: ({ elapsedTimeMs, maxRecordingMs, ctx }) => {
    ctx.fillStyle = 'red'
    ctx.font = '50px sans-serif'
    ctx.fillText(`${elapsedTimeMs}/${maxRecordingMs}`, 50, 50)
  },
})
```

### `XR8.MediaRecorder.stopRecording()`
`stopRecording(): void` — Stop the in-progress recording.

### `XR8.MediaRecorder.configure(options)`
`configure(options): void` — Configure recording settings (bitrate, size, duration).

### `XR8.MediaRecorder.requestMicrophone()`
`requestMicrophone(): void` — Enable audio recording, prompting for permission if
needed. See the `RequestMicOptions` enum for auto-request behavior.

## Gotchas

- On Android/Desktop a webm preview is produced first, then converted to mp4 —
  handle `onPreviewReady` → `onFinalizeProgress` → `onVideoReady`.
