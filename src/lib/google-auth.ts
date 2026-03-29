import { readFileSync } from "fs";
import path from "path";

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: string;
}

/**
 * Load Google service account credentials.
 * Supports two formats via GSC_SERVICE_ACCOUNT_JSON env var:
 *   - File path (local dev):  "credentials/sequel-brand-brain.json"
 *   - Inline JSON (Vercel):   '{"type":"service_account",...}'
 */
export function getServiceAccountCredentials(): ServiceAccountCredentials {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("GSC_SERVICE_ACCOUNT_JSON is not set");
  }

  // If it starts with "{", treat as inline JSON
  if (raw.trim().startsWith("{")) {
    return JSON.parse(raw);
  }

  // Otherwise treat as a file path (relative to project root)
  const filePath = path.isAbsolute(raw)
    ? raw
    : path.join(process.cwd(), raw);

  const fileContents = readFileSync(filePath, "utf-8");
  return JSON.parse(fileContents);
}
