import { describe, expect, it } from 'vitest';
import { ASSET_ID_RE, hexToBase64, sha256Hex } from './assetHash';

const bytesOf = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('sha256Hex', () => {
  // Published NIST vector for the empty input.
  it('hashes empty input to the known vector', async () => {
    await expect(sha256Hex(new ArrayBuffer(0))).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  // Published vector for "abc".
  it('hashes "abc" to the known vector', async () => {
    await expect(sha256Hex(bytesOf('abc'))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is stable across calls', async () => {
    const a = await sha256Hex(bytesOf('same'));
    const b = await sha256Hex(bytesOf('same'));
    expect(a).toBe(b);
  });

  it('produces something ASSET_ID_RE accepts', async () => {
    expect(ASSET_ID_RE.test(await sha256Hex(bytesOf('x')))).toBe(true);
  });
});

describe('hexToBase64', () => {
  it('converts the empty-input digest to its base64 form', () => {
    expect(hexToBase64('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe(
      '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
    );
  });
});

describe('ASSET_ID_RE', () => {
  it('rejects uppercase, wrong length, and non-hex', () => {
    expect(ASSET_ID_RE.test('A'.repeat(64))).toBe(false);
    expect(ASSET_ID_RE.test('a'.repeat(63))).toBe(false);
    expect(ASSET_ID_RE.test('g'.repeat(64))).toBe(false);
  });

  it('rejects a value trying to smuggle a path or scheme', () => {
    expect(ASSET_ID_RE.test('../../etc/passwd')).toBe(false);
    expect(ASSET_ID_RE.test('https://evil.example/x')).toBe(false);
  });
});
