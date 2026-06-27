import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCurlCommand } from "./curl-command";

const PAYLOAD_LOG_DIR = "reprocess-payloads";

type ReprocessPayloadLogInput = {
  documentId: string;
  body: string;
  url: string;
};

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "unknown";
}

function getSigningRepresentative(body: string): string {
  try {
    const payload = JSON.parse(body) as { SigningRepresentative?: unknown };
    const value = payload.SigningRepresentative;
    if (typeof value === "number" || typeof value === "string") return String(value);
  } catch {
    return "unknown";
  }
  return "unknown";
}

function parsePayload(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export async function saveReprocessPayload(input: ReprocessPayloadLogInput): Promise<string> {
  const executedAt = new Date().toISOString();
  const timestamp = executedAt.replace(/[:.]/g, "-");
  const signingRepresentative = safeSegment(getSigningRepresentative(input.body));
  const filename = [
    timestamp,
    `document-${safeSegment(input.documentId)}`,
    `signing-${signingRepresentative}`,
    randomUUID().slice(0, 8),
  ].join("_");

  const dir = path.join(process.cwd(), PAYLOAD_LOG_DIR);
  const filePath = path.join(dir, `${filename}.json`);
  const logEntry = {
    executedAt,
    method: "POST",
    url: input.url,
    documentId: input.documentId,
    curl: buildCurlCommand(input.url, input.body),
    payload: parsePayload(input.body),
  };

  await mkdir(dir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(logEntry, null, 2)}\n`, "utf8");

  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}
