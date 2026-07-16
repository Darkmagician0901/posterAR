import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  base64JpegToDataUrl,
  base64ToBlob,
  computeCoverCrop,
  generateFilename,
  screenshotResultFromBase64Jpeg,
  shareScreenshot,
  ScreenshotResult,
} from './screenshot';

// "hello" base64-encoded — 5 decoded bytes.
const HELLO_B64 = 'aGVsbG8=';

const fakeResult = (): ScreenshotResult => ({
  dataUrl: base64JpegToDataUrl(HELLO_B64),
  blob: base64ToBlob(HELLO_B64, 'image/jpeg'),
  filename: 'xr-poster-test.jpeg',
});

describe('generateFilename', () => {
  it('uses the xr-poster prefix and the format as extension', () => {
    expect(generateFilename('jpeg')).toMatch(
      /^xr-poster-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.jpeg$/,
    );
  });

  it('defaults to png', () => {
    expect(generateFilename()).toMatch(/\.png$/);
  });
});

describe('base64JpegToDataUrl', () => {
  it('prefixes the raw payload with the jpeg data-URL header', () => {
    expect(base64JpegToDataUrl(HELLO_B64)).toBe(`data:image/jpeg;base64,${HELLO_B64}`);
  });
});

describe('base64ToBlob', () => {
  it('decodes to the right byte length and mime type', () => {
    const blob = base64ToBlob(HELLO_B64, 'image/jpeg');
    expect(blob.size).toBe(5);
    expect(blob.type).toBe('image/jpeg');
  });
});

describe('screenshotResultFromBase64Jpeg', () => {
  it('builds dataUrl + blob + jpeg filename with no dimensions', () => {
    const result = screenshotResultFromBase64Jpeg(HELLO_B64);
    expect(result.dataUrl).toBe(`data:image/jpeg;base64,${HELLO_B64}`);
    expect(result.blob.size).toBe(5);
    expect(result.filename).toMatch(/\.jpeg$/);
    expect(result.width).toBeUndefined();
    expect(result.height).toBeUndefined();
  });
});

describe('computeCoverCrop', () => {
  it('crops left/right when the source is wider than the target', () => {
    // 200×100 source onto a square target: keep the centered 100×100.
    expect(computeCoverCrop(200, 100, 100, 100)).toEqual({
      sx: 50,
      sy: 0,
      sw: 100,
      sh: 100,
    });
  });

  it('crops top/bottom when the source is taller than the target', () => {
    // 100×200 source onto a square target: keep the centered 100×100.
    expect(computeCoverCrop(100, 200, 100, 100)).toEqual({
      sx: 0,
      sy: 50,
      sw: 100,
      sh: 100,
    });
  });

  it('keeps the full frame when aspects match', () => {
    expect(computeCoverCrop(1280, 720, 640, 360)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1280,
      sh: 720,
    });
  });
});

describe('shareScreenshot', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubNavigatorShare = (
    share: (() => Promise<void>) | undefined,
    canShare?: () => boolean,
  ) => {
    vi.stubGlobal('navigator', {
      ...navigator,
      share,
      canShare,
    });
  };

  it('returns unsupported when the Web Share API is missing', async () => {
    stubNavigatorShare(undefined, undefined);
    expect(await shareScreenshot(fakeResult())).toBe('unsupported');
  });

  it('returns unsupported when file payloads are rejected by canShare', async () => {
    stubNavigatorShare(vi.fn().mockResolvedValue(undefined), () => false);
    expect(await shareScreenshot(fakeResult())).toBe('unsupported');
  });

  it('returns shared when navigator.share resolves', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigatorShare(share, () => true);
    expect(await shareScreenshot(fakeResult())).toBe('shared');
    expect(share).toHaveBeenCalledOnce();
  });

  it('returns canceled when the user dismisses the share sheet', async () => {
    stubNavigatorShare(
      vi.fn().mockRejectedValue(new DOMException('canceled', 'AbortError')),
      () => true,
    );
    expect(await shareScreenshot(fakeResult())).toBe('canceled');
  });

  it('returns failed on any other rejection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubNavigatorShare(vi.fn().mockRejectedValue(new Error('boom')), () => true);
    expect(await shareScreenshot(fakeResult())).toBe('failed');
    consoleError.mockRestore();
  });
});
