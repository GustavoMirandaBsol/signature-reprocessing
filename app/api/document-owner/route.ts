import { type NextRequest } from "next/server";
import { httpsPost } from "../../lib/https-proxy";
import { saveReprocessPayload } from "../../lib/reprocess-payload-log";

const UPSTREAM =
  "https://bsol-business-api-signature-prod.bsol.com.bo/Bsol/BusinessApiSignature/v1/documentOwner/register";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const payloadFile = await saveReprocessPayload({ documentId: "document-owner", body, url: UPSTREAM });
  const upstream = await httpsPost(UPSTREAM, body);
  return new Response(upstream.text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.contentType,
      "X-Reprocess-Payload-File": payloadFile,
      "X-Reprocess-Post-Url": UPSTREAM,
    },
  });
}
