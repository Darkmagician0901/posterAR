# Frontend Integration Guide — XR Poster

> **Audience:** frontend / UI designers wiring their own screens and flows onto
> the existing AR engine. This is the contract: the stores, hooks, components,
> data types, and interaction rules you build against. You should not need to
> read the 8th Wall / three.js internals to build UI — everything you touch is
> listed here.
>
> Describes **production `main`**. For architecture depth see
> [`ARCHITECTURE.md`](ARCHITECTURE.md); for engine constraints see the
> **Gotchas** in [`CLAUDE.md`](CLAUDE.md).

---

## 1. Mental model — who owns what

The app splits cleanly into two halves:

| Layer | Owns | You (UI) touch it via |
|-------|------|-----------------------|
| **AR engine** (`src/xr8/`, `src/xr/`, `ARExperience`) | Camera feed, three.js canvas, render loop, hit-test, reticle, poster meshes, tap-to-place, ambient tint | **State only** — you mutate stores, the AR layer mirrors them into the 3D scene |
| **UI** (`src/components/`, `src/hooks/`) | Toolbars, overlays, modals, toasts, the whole 2D DOM on top of the canvas | Directly — this is your surface |

**The golden rule:** you never call three.js or 8th Wall. You drive everything
through **two Zustand stores** and **three hooks**. The AR layer subscribes to
`posterStore` and re-renders the scene when it changes (add a poster → a mesh
appears; change `scale` → it resizes; change `rotation[2]` → it spins in place;
remove → it disappears).

```
   Your UI  ──mutate──▶  posterStore / useUIState  ──subscribe──▶  AR scene (3D)
      ▲                                                                  │
      └───────────────  read state for rendering  ◀──────────────────────┘
```

---

## 2. App shell — the three branches

`App.tsx` detects device capability once on mount and renders exactly one of
three branches. Your UI lives **inside** the first two.

| Branch | When | What's live |
|--------|------|-------------|
| `ARExperience` | mobile + camera + HTTPS (`hasAR8`) | Real 8th Wall AR |
| `DesktopMockMode` | desktop | Webcam + mouse-look sandbox (same placement/UI code) |
| "AR Not Supported" | anything else | Static message + device-info table |

Both live branches mount the same shared overlays: `<Toast />`,
`<InstructionsOverlay />`, `<DiagnosticPanel />`. **Develop on desktop** — the
mock branch exercises your UI, the stores, placement, scaling, and rotation
without a phone. Only the camera-composited screenshot and ambient tint differ
from device.

`ARExperience` props (set by `App`, not usually by you):

```ts
interface ARExperienceProps {
  mode?: 'dev' | 'live';        // 'dev' force-opens the debug HUD; default 'live'
  onSessionStart?: () => void;  // fired when the AR session goes live
  onSessionEnd?: () => void;    // fired on teardown
}
```

---

## 3. State stores — your primary surface

### 3.1 `usePosterStore` — placed posters + gallery uploads

```ts
import { usePosterStore } from '@/store/posterStore';
```

Selector usage (re-renders only when the picked slice changes):

```ts
const posters    = usePosterStore((s) => s.posters);
const selectedId = usePosterStore((s) => s.selectedPosterId);
const updatePoster = usePosterStore((s) => s.updatePoster);
```

**State**

| Field | Type | Meaning |
|-------|------|---------|
| `posters` | `Poster[]` | Posters currently in the scene (capped at `maxPosters`) |
| `selectedPosterId` | `string \| null` | Most recently placed/selected poster |
| `maxPosters` | `number` | Placement cap (`VITE_MAX_POSTERS`, default 10) |
| `uploadedPosters` | `UploadedPoster[]` | Images in the gallery |
| `currentPosterImage` | `string` | Image the **next** tap-to-place will use |

**Actions**

| Action | Signature | Notes |
|--------|-----------|-------|
| `addPoster` | `(opts: CreatePosterOptions) => string \| null` | Returns new ID, or `null` when the cap is hit (AR layer normally calls this on tap; you rarely do) |
| `removePoster` | `(id: string) => void` | Unknown IDs are a no-op |
| `updatePoster` | `(id, updates: Partial<Poster>) => void` | Shallow-merge; bumps `updatedAt`. **This is how the scale + rotation sliders work** |
| `selectPoster` | `(id: string \| null) => void` | `null` deselects |
| `clearPosters` | `() => void` | Empties the scene (uploads untouched) |
| `getPosterById` | `(id) => Poster \| undefined` | Pure lookup |
| `addUploadedPoster` | `(Omit<UploadedPoster,'id'\|'uploadedAt'>) => string` | Adds to gallery **and** sets it as `currentPosterImage` |
| `removeUploadedPoster` | `(id) => void` | Falls back `currentPosterImage` to first remaining upload, or the bundled default |
| `setCurrentPosterImage` | `(imageUrl: string) => void` | Gallery selection — picks what the next tap places |

> **Placement is engine-driven.** The user taps the screen → `ARExperience`
> reads the reticle pose and calls `addPoster` with the world transform +
> `currentPosterImage`. Your job is to set `currentPosterImage` (via the
> gallery / upload) and to render / scale / rotate / delete from the `posters`
> list. You do **not** position posters from the DOM.

### 3.2 `useUIState` — overlays + toasts

```ts
import { useUIState } from '@/hooks/useUIState';
```

| Field / Action | Type | Notes |
|----------------|------|-------|
| `showInstructions` | `boolean` | Instructions overlay visibility |
| `showLoading` | `boolean` | AR loading screen visibility |
| `toasts` | `ToastMessage[]` | Live toast queue (oldest first) |
| `setShowInstructions` | `(show: boolean) => void` | Dismissing (`false`) persists "tutorial done" to localStorage |
| `setShowLoading` | `(show: boolean) => void` | — |
| `addToast` | `(Omit<ToastMessage,'id'>) => void` | Auto-dismisses after `duration` (default 3000 ms) |
| `removeToast` | `(id: string) => void` | — |

Helper: `useTutorialCompleted(): boolean` — true if the user dismissed
instructions on a previous visit (use it to decide whether to auto-show them).

```ts
addToast({ type: 'success', message: 'Poster placed' });
// type: 'success' | 'error' | 'info'
```

---

## 4. Hooks — flows packaged for you

### 4.1 `usePosterUpload()` — pick / validate / compress an image

Everything is client-side; "upload" = decode + compress to a `data:` URL (no
network). GIFs are preserved and animated; other images become WebP. Validation
errors never throw — they surface as `{ success: false, error }` **and** a toast.

```ts
const {
  uploadState,            // { isUploading, progress (0–100), error }
  handleFileSelect,       // (file: File) => Promise<UploadResult>   — drag/drop, paste
  handleFileInputChange,  // (event) => Promise<UploadResult | null> — wire to <input>.onChange
  resetUpload,            // () => void
  fileInputRef,           // attach to a hidden <input type="file">
  triggerFileInput,       // () => void — opens the OS picker
} = usePosterUpload();
```

`UploadResult`: `{ success, imageUrl?, error?, processedImage? }`. On success,
hand `imageUrl` + `processedImage` to `addUploadedPoster` (see `ControlPanel`
for the canonical wiring).

### 4.2 `useScreenshot(options?)` — capture → preview → save / share

```ts
const {
  photo,          // ScreenshotResult | null — non-null means "open the preview"
  isCapturing,    // disable the shutter while true
  isSharing,
  canShare,       // Web Share API w/ file support present?
  capturePhoto,   // () => Promise<boolean>
  savePhoto,      // () => void  (download)
  sharePhoto,     // () => Promise<boolean>  (Web Share; silent on user-cancel)
  closePreview,   // () => void
} = useScreenshot();
```

Render `<PhotoPreview>` whenever `photo` is non-null. On the desktop mock pass
`options.capture` (its own video+GL compositor); on live AR the default uses the
engine's compositor. See the **screenshot caveat** in §7.

### 4.3 `useArLoadProgress(active: boolean)` — startup progress bar

Returns `{ percent (0–100), label, error }`, monotonic while `active`. The WASM
download gives no byte progress, so it "trickles" toward soft caps per stage
("Downloading AR engine…" → "Starting camera…" → "Initializing camera…" →
"Ready"). Feed `active` = "is the AR loading overlay showing". On engine failure
`error` is `true` and `label` carries the reason — freeze the bar and show it.

---

## 5. Interaction model — what users can actually do

This is deliberately minimal; design around it:

- **Tap to place** — a tap anywhere drops a poster (using `currentPosterImage`)
  flat on the surface under the center reticle, up to `maxPosters`.
- **Scale slider** — bind a range input (`MIN_POSTER_SCALE` 0.1 →
  `MAX_POSTER_SCALE` 3.0) to `updatePoster(id, { scale: [w, w*aspect, depth] })`.
  Height follows the image aspect ratio so it never stretches; depth is fixed.
- **Rotation slider** — bind a range input (`MIN_POSTER_ROTATION_DEG` −180 →
  `MAX_POSTER_ROTATION_DEG` 180, **degrees**) to
  `updatePoster(id, { rotation: [x, y, radians] })`, writing `rotation[2]` (the
  in-plane spin about the surface normal, **stored in radians**). Convert at the
  UI boundary: `radians = deg * Math.PI / 180`.
- **Delete** — `removePoster(id)`.
- **NO move / pinch / twist gestures.** The gesture stack was removed in the 8th
  Wall migration; the **scale + rotation sliders are the only live adjustments**.
  Do not design flows that assume dragging or two-finger manipulation of a placed
  poster. (Repositioning means delete + re-place.)
- **Reticle** is rendered in 3D by the engine, not the DOM — you can't restyle it
  from CSS, but you can describe it in onboarding copy: it transitions from
  `searching` (pulsing, head-locked) to `tracking` (locked to the detected
  surface), and the poster lies **flat** on that surface with its top edge
  pointing away from the viewer.

---

## 6. Existing UI components (reuse or replace)

All components are plain React + a sibling `.css` file you can restyle or swap.
Props below are the integration contract.

| Component | Props | Role |
|-----------|-------|------|
| `ControlPanel` | `{ isARActive: boolean }` | Floating toolbar: clear / photo / upload / gallery / help / debug. Renders `null` until the session is active. Owns gallery + photo-preview modals internally |
| `PosterControls` | _none_ | **Scale slider + rotation slider + delete** for the selected poster. Renders `null` when nothing is selected |
| `PosterGallery` | `{ onClose: () => void }` | Modal grid of default + uploaded images; selecting one sets `currentPosterImage` |
| `PhotoPreview` | `{ photo, canShare, isSharing, onSave, onShare, onClose }` | Full-screen captured-photo preview with save/share |
| `Toast` | _none_ | Renders the `useUIState` toast queue. Mount once near the root |
| `InstructionsOverlay` | _none_ | Tutorial overlay; reads/writes `useUIState.showInstructions` |
| `DiagnosticPanel` | _none_ | Always-on subsystem health (engine/camera/motion/tracking/hit-test) |
| `DebugHUD` | _none_ | FPS + live subsystem state; toggle via the Debug button or `?debug=1` |

**Ambient realism (automatic, no UI needed):** placed posters are tinted toward
the room's brightness and color cast — the engine samples a tiny downsampled
camera frame (`ambientProbe`) so a poster doesn't glow like a sticker. Posters
also honor **PNG/GIF transparency**. You don't drive any of this; just know that
placed posters won't look flat-lit, and that transparent images show through.

---

## 7. Data types (import from `@/types` or the owning module)

```ts
// @/types
interface Poster {
  id: string;
  imageUrl: string;                       // data: URL (upload) or bundled path
  position: [number, number, number];     // metres, AR space
  rotation: [number, number, number];     // Euler radians; rotation[2] = in-plane spin (the rotation slider)
  scale:    [number, number, number];     // [width, height, depth] in METRES (not a multiplier)
  createdAt: number; updatedAt: number;
}
interface CreatePosterOptions {           // addPoster input; omitted → defaults
  imageUrl: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?:    [number, number, number];
}
interface XRSupport {                      // capability snapshot from detectXRSupport()
  hasAR8: boolean; hasCamera: boolean; hasGyroscope: boolean;
  isIOS: boolean; isAndroid: boolean; isMobile: boolean; isDesktop: boolean;
  browserName: string; browserVersion: string;
}

// @/store/posterStore
interface UploadedPoster { id: string; imageUrl: string; name: string; uploadedAt: number; width: number; height: number; }

// @/hooks/useUIState
interface ToastMessage { id: string; type: 'success' | 'error' | 'info'; message: string; duration?: number; }

// @/hooks/usePosterUpload
interface UploadState  { isUploading: boolean; progress: number; error: string | null; }
interface UploadResult { success: boolean; imageUrl?: string; error?: string; processedImage?: ProcessedImage; }
```

Tunables in `@/utils/constants`: `DEFAULT_POSTER_WIDTH/HEIGHT/DEPTH`,
`MIN_POSTER_SCALE`, `MAX_POSTER_SCALE`, `MIN_POSTER_ROTATION_DEG`,
`MAX_POSTER_ROTATION_DEG`, `MAX_POSTERS`, `DEFAULT_POSTER_IMAGE`, `UI_TEXT`,
`STORAGE_KEYS`.

---

## 8. Constraints designers must respect

- **No drag/pinch/twist** — scale slider + rotation slider + delete only (§5).
- **Horizontal surfaces only.** 8th Wall detects a single horizontal ground
  plane; posters lie flat on floors/tables, not walls. (App-side wall detection
  was prototyped and **reverted as unstable** — treat walls as unsupported until
  it is reworked.)
- **GIFs stay GIFs** — animated GIFs are uploaded uncompressed (≤ 8 MB) and
  animated per-frame. Don't add UI that re-encodes them. Other images compress
  to WebP (≤ 2 MB wire, longest axis ≤ 2048 px; input cap 50 MB).
- **Screenshots on live AR can be blank** outside the engine compositor — always
  capture via `useScreenshot` (which uses the XR8 path), never a raw
  `canvas.toDataURL()`.
- **HTTPS (or localhost) required** for camera + engine. Plain `http://` won't
  reach the AR branch.
- **Everything is client-side** — no backend; uploaded images live only in
  memory (data URLs) for the session.

---

## 9. Common recipes

**Place a different image next:**
```ts
const setImg = usePosterStore((s) => s.setCurrentPosterImage);
setImg(uploadedPoster.imageUrl);   // next tap uses this
```

**Scale the selected poster:**
```ts
const { selectedPosterId, getPosterById, updatePoster } = usePosterStore();
const p = getPosterById(selectedPosterId!);
const w = 1.2; // metres, within [MIN_POSTER_SCALE, MAX_POSTER_SCALE]
updatePoster(p.id, { scale: [w, w * (p.scale[1] / p.scale[0]), p.scale[2]] });
```

**Rotate the selected poster (degrees → radians):**
```ts
const deg = 45; // within [MIN_POSTER_ROTATION_DEG, MAX_POSTER_ROTATION_DEG]
updatePoster(p.id, { rotation: [p.rotation[0], p.rotation[1], deg * Math.PI / 180] });
```

**Toast on an action:**
```ts
useUIState.getState().addToast({ type: 'info', message: 'Tap a surface to place' });
```

**Gate UI on AR readiness:**
```ts
const showLoading = useUIState((s) => s.showLoading);
const { percent, label, error } = useArLoadProgress(showLoading);
```

---

## 10. Where to look in code

| You want… | File |
|-----------|------|
| Branch / capability routing | `src/App.tsx` |
| Placed-poster state | `src/store/posterStore.ts` |
| Overlays + toasts | `src/hooks/useUIState.ts` |
| Upload flow | `src/hooks/usePosterUpload.ts` |
| Photo flow | `src/hooks/useScreenshot.ts` |
| Loading progress | `src/hooks/useArLoadProgress.ts` |
| Toolbar / modals | `src/components/ui/*` |
| Scale + rotation + delete controls | `src/components/ui/PosterControls.tsx` |
| AR session lifecycle | `src/components/ar/ARExperience.tsx` |
| Types | `src/types/index.ts`, `src/utils/constants.ts` |
