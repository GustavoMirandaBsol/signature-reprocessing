import { type NextRequest } from "next/server";
import { httpsPost } from "../../../lib/https-proxy";
import { saveReprocessPayload } from "../../../lib/reprocess-payload-log";

const UPSTREAM =
  "https://bsol-business-api-signature-prod.bsol.com.bo/Bsol/BusinessApiSignature/v1/Reprocess/Documents";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/reprocess/[documentId]">
) {
  const { documentId } = await ctx.params;
  const body = await req.text();
  const postUrl = `${UPSTREAM}/${documentId}/execute`;
  const payloadFile = await saveReprocessPayload({ documentId, body, url: postUrl });
  const upstream = await httpsPost(postUrl, body);
  return new Response(upstream.text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.contentType,
      "X-Reprocess-Payload-File": payloadFile,
      "X-Reprocess-Post-Url": postUrl,
    },
  });
}
