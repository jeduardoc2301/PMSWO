import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

function getS3Config() {
  const BUCKET = process.env.S3_AVATAR_BUCKET
  const REGION = process.env.S3_AVATAR_REGION ?? 'us-east-1'
  const accessKeyId = process.env.APP_AWS_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.APP_AWS_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY

  console.error('[S3-CONFIG] env check — BUCKET:', BUCKET ?? 'MISSING', '| REGION:', REGION,
    '| KEY:', accessKeyId ? 'SET' : 'MISSING', '| SECRET:', secretAccessKey ? 'SET' : 'MISSING')

  if (!BUCKET) throw new Error('S3_AVATAR_BUCKET env var is not set')
  if (!accessKeyId) throw new Error('AWS access key (APP_AWS_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID) is not set')
  if (!secretAccessKey) throw new Error('AWS secret key (APP_AWS_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY) is not set')

  const client = new S3Client({
    region: REGION,
    credentials: { accessKeyId, secretAccessKey },
  })
  return { BUCKET, REGION, client }
}

/**
 * Upload a base64-encoded avatar to S3 and return the public URL.
 * Accepts data URIs ("data:image/...;base64,...") or raw base64.
 */
export async function uploadAvatar(base64Input: string, userId: string): Promise<string> {
  const { BUCKET, REGION, client } = getS3Config()
  console.error('[S3-AVATAR] uploadAvatar — bucket:', BUCKET, '| region:', REGION)

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

  console.error('[S3-AVATAR] PutObject — key:', key, '| mimeType:', mimeType, '| bufferSize:', buffer.length)

  try {
    await client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'max-age=31536000',
    }))
  } catch (s3Err) {
    console.error('[S3-AVATAR] PutObject failed:', s3Err instanceof Error ? s3Err.message : s3Err)
    throw s3Err
  }

  const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
  console.error('[S3-AVATAR] Upload OK — url:', url)
  return url
}

/**
 * Delete a previously uploaded avatar from S3.
 * Accepts the full URL; silently ignores non-S3 strings (e.g. old base64).
 */
export async function deleteAvatar(url: string): Promise<void> {
  if (!url) return
  const { BUCKET, client } = getS3Config()
  if (!url.includes(BUCKET)) return
  const key = url.split('.amazonaws.com/')[1]
  if (!key) return
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

/**
 * Return a presigned GET URL for an S3 avatar (valid for ttlSeconds).
 * Passes through base64 data URIs and empty strings unchanged.
 */
export async function getPresignedAvatarUrl(avatar: string | null | undefined, ttlSeconds = 86400): Promise<string | null> {
  if (!avatar) return null
  const { BUCKET, client } = getS3Config()
  if (!avatar.startsWith(`https://${BUCKET}.s3`)) return avatar
  const key = avatar.split('.amazonaws.com/')[1]
  if (!key) return null
  return getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: ttlSeconds })
}
