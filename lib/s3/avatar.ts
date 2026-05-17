import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

const BUCKET = process.env.S3_AVATAR_BUCKET!
const REGION = process.env.S3_AVATAR_REGION ?? 'us-east-1'

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: (process.env.APP_AWS_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID)!,
    secretAccessKey: (process.env.APP_AWS_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY)!,
  },
})

/**
 * Upload a base64-encoded avatar to S3 and return the public URL.
 * Accepts data URIs ("data:image/...;base64,...") or raw base64.
 */
export async function uploadAvatar(base64Input: string, userId: string): Promise<string> {
  let mimeType = 'image/jpeg'
  let base64Data = base64Input

  if (base64Input.startsWith('data:')) {
    const match = base64Input.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) throw new Error('Invalid base64 data URI')
    mimeType = match[1]
    base64Data = match[2]
  }

  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
  const key = `avatars/${userId}/${randomUUID()}.${ext}`
  const buffer = Buffer.from(base64Data, 'base64')

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    CacheControl: 'max-age=31536000',
  }))

  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
}

/**
 * Delete a previously uploaded avatar from S3.
 * Accepts the full URL; silently ignores non-S3 strings (e.g. old base64).
 */
export async function deleteAvatar(url: string): Promise<void> {
  if (!url || !url.includes(BUCKET)) return
  const key = url.split('.amazonaws.com/')[1]
  if (!key) return
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

function isS3Avatar(avatar: string): boolean {
  return !!avatar && avatar.startsWith(`https://${BUCKET}.s3`)
}

function extractKey(s3Url: string): string {
  return s3Url.split('.amazonaws.com/')[1]
}

/**
 * Return a presigned GET URL for an S3 avatar (valid for ttlSeconds).
 * Passes through base64 data URIs and empty strings unchanged.
 */
export async function getPresignedAvatarUrl(avatar: string | null | undefined, ttlSeconds = 86400): Promise<string | null> {
  if (!avatar) return null
  if (!isS3Avatar(avatar)) return avatar
  const key = extractKey(avatar)
  if (!key) return null
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: ttlSeconds })
}
