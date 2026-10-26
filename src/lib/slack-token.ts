/**
 * #207: the sealed form a workspace's Slack bot token is stored in (`slack_connections.token_ciphertext`).
 * AES-256-GCM under `LANE_SLACK_TOKEN_KEY`, with the workspace id as associated data, so a sealed token copied
 * to another workspace's row does not open. Format `v1:<iv>:<tag>:<ciphertext>`, each part base64url; the
 * migration refuses anything else. Opening never throws: a wrong key, workspace or damaged text is `null`.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

type Seal = { key: Buffer; orgId: string }

export function sealSlackToken(token: string, { key, orgId }: Seal): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(orgId, "utf8"))
  const sealed = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  return ["v1", iv, cipher.getAuthTag(), sealed].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(":")
}

export function openSlackToken(text: string, { key, orgId }: Seal): string | null {
  const [version, iv, tag, sealed, ...rest] = text.split(":")
  if (version !== "v1" || !iv || !tag || !sealed || rest.length) return null
  const authTag = Buffer.from(tag, "base64url")
  if (authTag.length !== 16) return null
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"))
    decipher.setAAD(Buffer.from(orgId, "utf8"))
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(Buffer.from(sealed, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}
