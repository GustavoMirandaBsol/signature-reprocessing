import { type NextRequest } from "next/server";
import { httpsPost } from "../../lib/https-proxy";

const UPSTREAM = "https://bsol-business-api-signature-prod.bsol.com.bo/test/loan/sign";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSignPayload(value: unknown): unknown {
  if (isRecord(value) && isRecord(value.Input)) {
    return value.Input;
  }

  return value;
}

export async function POST(req: NextRequest) {
  let parsed: unknown;

  try {
    parsed = await req.json();
  } catch {
    return Response.json(
      { error: "El cuerpo de la solicitud debe ser un JSON válido." },
      { status: 400 }
    );
  }

  try {
    const body = JSON.stringify(getSignPayload(parsed));
    const upstream = await httpsPost(UPSTREAM, body);
    return new Response(upstream.text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.contentType },
    });
  } catch (error) {
    return Response.json(
      {
        error: "No se pudo comunicar con el servicio de firma.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
