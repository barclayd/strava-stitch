import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
export function seal(value: unknown, key: Uint8Array): string {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv)
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64')
}
export function unseal<T>(value: string, key: Uint8Array): T {
  const bytes = Buffer.from(value, 'base64'),
    decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return JSON.parse(
    Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
  )
}
