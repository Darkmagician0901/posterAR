# Image marker fingerprints

Drop generated 8th Wall image-target files here, then list the JSON in
`manifest.json`. The marker testbed (`?mode=marker`) loads everything listed
and hands it to the engine.

Nothing is committed by default — fingerprints are tied to whichever picture
you actually print, so generating your own is the first step.

## 1. Pick a marker picture

8th Wall uses **natural-feature tracking**: it locks onto the distinctive
detail inside a picture. It is not a QR/ArUco-style fiducial reader.

A good marker:

- **detailed and busy** — dense, irregular texture (a photo, a painting,
  album art, a map)
- **high contrast**, and **non-repeating** — stripes, checkerboards, and
  regular patterns confuse matching because every region looks alike
- **3:4 portrait**, at least **480 x 640 px**, under **2048 x 2048 px**
- **flat and matte** when printed — gloss reflects and washes out features

A plain high-contrast shape (a solid square, a simple logo) tracks **badly**.
It has almost nothing to match against, so it will look like the tracker is
unstable when really the marker is at fault — which would invalidate exactly
the measurement this testbed exists to take.

Print it a few inches across and keep it flat.

## 2. Generate the fingerprint

```bash
npx @8thwall/image-target-cli@latest
```

The CLI is **interactive** — it prompts for the source image, a crop, the
target name, and an output folder. There is no documented flag-driven or
headless mode, so this is a manual, one-time step per marker.

It writes roughly six files: the target **JSON**, the original, a cropped
copy, a thumbnail, and the grayscale **luminance** image (480 x 640) the
tracker actually matches against.

Copy all of them into this folder.

## 3. List it in the manifest

```json
{ "targets": ["my-marker.json"] }
```

Paths are resolved relative to this folder. On load, each target's
`imagePath` is rewritten to point here too — the engine otherwise resolves it
relative to the *page* URL and would fail to find its own feature image.

## 4. Run the testbed

```bash
npm run dev
```

Open `https://<your-lan-ip>:5173/?mode=marker` on the phone (HTTPS is required
for the camera and the engine), tap **ENTER MARKER TEST**, and point it at the
printed marker.

## Notes

- The open-source engine takes target **data** — `configure({ imageTargetData:
  [...] })`. The old hosted form that referenced targets by a name registered
  in the 8th Wall console (`configure({ imageTargets: ['name'] })`) stopped
  working when the hosted platform was retired; passing names to this build
  detects nothing.
- Up to 10 targets can be scanned simultaneously.
- Everything runs on the device. No image, fingerprint, or camera frame is
  sent to 8th Wall.
