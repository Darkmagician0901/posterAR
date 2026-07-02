import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { AppConfig } from '../config.js'

export interface ObjectStore {
  presignPut(key: string, contentType: string): Promise<string>
  publicUrl(key: string): string
}

export function createObjectStore(s3: AppConfig['s3']): ObjectStore {
  const client = new S3Client({
    endpoint: s3.endpoint,
    region: s3.region,
    forcePathStyle: true, // required for Supabase / S3-compatible endpoints
    credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
  })

  return {
    async presignPut(key, contentType) {
      const cmd = new PutObjectCommand({ Bucket: s3.bucket, Key: key, ContentType: contentType })
      return getSignedUrl(client, cmd, { expiresIn: 300 })
    },
    publicUrl(key) {
      return `${s3.publicBaseUrl.replace(/\/$/, '')}/${key}`
    },
  }
}
