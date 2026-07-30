import { describe, expect, it, beforeEach } from 'vitest';

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
