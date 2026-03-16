import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";

// ============================================================================
// Telegram Web App initData Validation (FR-4.2)
// ============================================================================
// Validates the cryptographic signature of data sent from the Telegram
// Mini App to the backend. This prevents spoofing and unauthorized
// state changes.
//
// Reference: https://core.telegram.org/bots/webapps#validating-data
// ============================================================================

export interface ValidatedInitData {
  userId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  authDate: number;
}

/**
 * Validate Telegram Web App initData using HMAC-SHA256.
 *
 * @param initData  The raw `initData` string from the Mini App.
 * @param botToken  The bot token (used to derive the secret key).
 * @param maxAgeSeconds  Maximum age of the initData before it's considered expired (default: 5 minutes).
 * @returns The validated user data, or null if validation fails.
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 300,
): ValidatedInitData | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    // Build the data-check-string (alphabetically sorted, excluding hash)
    params.delete("hash");
    const entries = Array.from(params.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

    // Derive secret key: HMAC-SHA256("WebAppData", botToken)
    const secretKey = createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    // Compute expected hash: HMAC-SHA256(secretKey, dataCheckString)
    const expectedHash = createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    // Constant-time comparison
    if (!timingSafeEqual(hash, expectedHash)) {
      return null;
    }

    // Check expiration
    const authDate = Number(params.get("auth_date"));
    const now = Date.now() / 1000;
    if (!authDate || now - authDate > maxAgeSeconds) {
      return null;
    }

    // Parse user data
    const userRaw = params.get("user");
    if (!userRaw) return null;

    const user = JSON.parse(userRaw);
    return {
      userId: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      authDate,
    };
  } catch (err) {
    console.error("[validateInitData] Error during validation", err);
    return null;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return cryptoTimingSafeEqual(bufA, bufB);
}