/**
 * Vitest setup for the Convex backend tests.
 *
 * `auth:signIn` mints a JWT, which needs the deployment's RSA private key
 * and site URL in the environment. convex-test runs the real Convex Auth
 * code in memory, so generate a throwaway key once per worker and expose it
 * the way `npx @convex-dev/auth` would on a deployment.
 */
import { webcrypto } from "node:crypto";

const subtle = (globalThis.crypto ?? webcrypto).subtle;

function pem(der: ArrayBuffer): string {
  const b64 = Buffer.from(der).toString("base64");
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

if (!process.env.JWT_PRIVATE_KEY) {
  const key = await subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  process.env.JWT_PRIVATE_KEY = pem(await subtle.exportKey("pkcs8", key.privateKey));
  const jwk = await subtle.exportKey("jwk", key.publicKey);
  process.env.JWKS = JSON.stringify({ keys: [{ use: "sig", ...jwk }] });
}
process.env.CONVEX_SITE_URL ??= "https://test.convex.site";
process.env.SITE_URL ??= "http://localhost:3000";
// Convex Auth logs every auth:store call at INFO; keep test output readable.
process.env.AUTH_LOG_LEVEL ??= "ERROR";
