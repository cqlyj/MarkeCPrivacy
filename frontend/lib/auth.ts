import jwt, { JwtHeader } from "jsonwebtoken";
import jwksClient, { CertSigningKey, RsaSigningKey } from "jwks-rsa";

interface DecodedToken {
  email?: string;
  [key: string]: unknown;
}

// Cache and rate-limit JWKS requests
const client = jwksClient({
  jwksUri: `https://app.dynamic.xyz/api/v0/sdk/${process.env.DYNAMIC_ENVIRONMENT_ID}/.well-known/jwks`,
  cache: true,
  cacheMaxAge: 10 * 60 * 1000, // 10 minutes
  cacheMaxEntries: 5,
  rateLimit: true,
});

function getSigningKey(header: JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!header.kid) {
      reject(new Error("Invalid token header: missing kid"));
      return;
    }

    client.getSigningKey(header.kid, (err, key) => {
      if (err || !key) {
        reject(err || new Error("Signing key not found"));
        return;
      }
      const signingKey =
        (key as CertSigningKey).publicKey ||
        (key as RsaSigningKey).rsaPublicKey;
      if (!signingKey) {
        reject(new Error("Unable to get signing key"));
      } else {
        resolve(signingKey);
      }
    });
  });
}

export async function verifyDynamicToken(token: string): Promise<DecodedToken> {
  if (!process.env.DYNAMIC_ENVIRONMENT_ID) {
    throw new Error("DYNAMIC_ENVIRONMENT_ID env var is not set");
  }

  const decoded = await new Promise<DecodedToken>((resolve, reject) => {
    jwt.verify(
      token,
      // Key retrieval callback
      (header, callback) => {
        getSigningKey(header as JwtHeader)
          .then((key) => callback(null, key))
          .catch(callback);
      },
      {
        algorithms: ["RS256"],
      },
      (err, payload) => {
        if (err) return reject(err);
        resolve(payload as DecodedToken);
      }
    );
  });

  return decoded;
}

export function isEmailAllowed(email: string | undefined): boolean {
  const raw = process.env.ALLOWED_EMAILS || "";
  const allowlist = raw.split(/[,;\s]+/).filter(Boolean);
  return email !== undefined && allowlist.includes(email.toLowerCase());
}
