import { type NextRequest } from "next/server";
import https from "node:https";

const UPSTREAM =
  "https://bsol-business-api-signature-prod.bsol.com.bo/Bsol/BusinessApiSignature/v1/Reprocess/Documents";

// The API uses an internal/self-signed certificate that Node.js can't verify.
// We use node:https directly so we can set rejectUnauthorized: false scoped to this proxy.
function httpsPost(url: string, body: string): Promise<{ status: number; text: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 500,
            text: Buffer.concat(chunks).toString("utf-8"),
            contentType: (res.headers["content-type"] as string) ?? "application/json",
          });
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/reprocess/[documentId]">
) {
  const { documentId } = await ctx.params;
  const body = await req.text();

  const upstream = await httpsPost(`${UPSTREAM}/${documentId}/execute`, body);

  return new Response(upstream.text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.contentType },
  });
}
