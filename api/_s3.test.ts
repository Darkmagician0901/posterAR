import { describe, expect, it, beforeEach } from 'vitest';
import { PutObjectCommand } from '@aws-sdk/client-s3';

beforeEach(() => {
  process.env.S3_BUCKET = 'test-bucket';
  process.env.S3_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
  process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  delete process.env.AWS_ROLE_ARN;
});

describe('presignPutConditional', () => {
  it('signs both the conditional and the checksum headers', async () => {
    const { presignPutConditional } = await import('./_s3');
    const url = await presignPutConditional(
      'assets/abc/full.webp',
      'image/webp',
      '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
    );
    const signed = decodeURIComponent(new URL(url).searchParams.get('X-Amz-SignedHeaders') ?? '');
    // Both must be SIGNED, not merely sent: an unsigned header can be dropped
    // or altered by the client, which defeats both guarantees.
    expect(signed).toContain('if-none-match');
    expect(signed).toContain('x-amz-checksum-sha256');
  });

  it('targets the configured bucket', async () => {
    const { presignPutConditional } = await import('./_s3');
    const url = await presignPutConditional('assets/abc/full.webp', 'image/webp', 'zz');
    expect(url).toContain('test-bucket');
  });
});

describe('putJson', () => {
  it('sends the body, content type, and cache control verbatim', async () => {
    const sent: PutObjectCommand[] = [];
    const { putJson, getS3 } = await import('./_s3');
    // Replace the client's send with a recorder. The helper is a transport
    // shell, so what matters is exactly what it hands to the SDK.
    (getS3() as unknown as { send: (c: PutObjectCommand) => Promise<void> }).send = async (c) => {
      sent.push(c);
    };

    await putJson('stories/x.json', '{"a":1}', 'public, max-age=60, must-revalidate');

    expect(sent).toHaveLength(1);
    expect(sent[0].input.Key).toBe('stories/x.json');
    expect(sent[0].input.Body).toBe('{"a":1}');
    expect(sent[0].input.ContentType).toBe('application/json');
    expect(sent[0].input.CacheControl).toBe('public, max-age=60, must-revalidate');
  });
});

describe('getJson', () => {
  it('parses and returns the stored body', async () => {
    const { getJson, getS3 } = await import('./_s3');
    (
      getS3() as unknown as { send: (c: unknown) => Promise<{ Body: { transformToString: () => Promise<string> } }> }
    ).send = async () => ({ Body: { transformToString: async () => '{"a":1}' } });

    expect(await getJson('exhibits/x.json')).toEqual({ a: 1 });
  });

  it('returns null on a 404, matching objectExists', async () => {
    const { getJson, getS3 } = await import('./_s3');
    (getS3() as unknown as { send: (c: unknown) => Promise<never> }).send = async () => {
      throw Object.assign(new Error('NotFound'), { $metadata: { httpStatusCode: 404 } });
    };

    expect(await getJson('exhibits/missing.json')).toBeNull();
  });

  it('rethrows every other error rather than reporting it as missing', async () => {
    const { getJson, getS3 } = await import('./_s3');
    (getS3() as unknown as { send: (c: unknown) => Promise<never> }).send = async () => {
      throw Object.assign(new Error('Region is missing'), { $metadata: { httpStatusCode: 500 } });
    };

    await expect(getJson('exhibits/x.json')).rejects.toThrow('Region is missing');
  });
});
