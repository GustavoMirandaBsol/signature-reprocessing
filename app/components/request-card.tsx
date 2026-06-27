"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SigningRequest } from "../types/signing-request";
import { useSigningRequests } from "../context/signing-requests";
import { buildCurlCommand } from "../lib/curl-command";
import { saveJob } from "../lib/reprocess-jobs";
import { PARTICIPANT_LABELS } from "../lib/constants";
import { DocumentsTable } from "./documents-table";
import { CopyButton } from "./copy-button";
import { SpinnerIcon, CheckIcon, XIcon, ChevronDownIcon, PenIcon } from "./icons";

type SignStatus = "idle" | "loading" | "success" | "error";
type OwnerStatus = "idle" | "loading" | "completed" | "error";

const SIGN_BUTTON_CLASS: Record<SignStatus, string> = {
  idle: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50",
  loading: "bg-indigo-600 text-white disabled:opacity-50",
  success: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700 hover:bg-red-200",
};

const SIGN_LABEL: Record<SignStatus, string> = {
  idle: "Firmar",
  loading: "Firmando…",
  success: "Firmado",
  error: "Reintentar",
};

type ParticipantPanelInfo = {
  id: string;
  documentDirectoryId: string;
  interviewId: string;
};

function emptyLabel(value: string | undefined): string {
  return value && value.trim() ? value : "—";
}

function getParticipantPanelInfo(request: SigningRequest, signingRepresentative: number): ParticipantPanelInfo {
  const signatory = request.Documents.flatMap((doc) => doc.SingSetting.Signatories)
    .find((sig) => sig.SigningRepresentative === signingRepresentative);

  return {
    id: emptyLabel(signatory?.ClientGuid),
    documentDirectoryId: emptyLabel(signatory?.ClientDirectoryId),
    interviewId: emptyLabel(signatory?.InterviewId),
  };
}

function PanelValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5">
        <span className="font-mono text-xs text-gray-600 break-all">{value}</span>
        {value !== "—" && <CopyButton text={value} />}
      </dd>
    </div>
  );
}

export function RequestCard({
  request,
  index,
  onRemove,
}: {
  request: SigningRequest;
  index: number;
  onRemove: () => void;
}) {
  const router = useRouter();
  const { expandedMap, setExpanded: setGlobalExpanded } = useSigningRequests();
  const expanded = expandedMap[request.DocumentDirectoryId] ?? false;
  const setExpanded = (val: boolean) => setGlobalExpanded(request.DocumentDirectoryId, val);

  const [signStatus, setSignStatus] = useState<SignStatus>("idle");
  const [signError, setSignError] = useState<string | null>(null);

  const [ownerStatuses, setOwnerStatuses] = useState<Record<number, OwnerStatus>>({});
  const [ownerJobIds, setOwnerJobIds] = useState<Record<number, string>>({});

  async function handleSign() {
    setSignStatus("loading");
    setSignError(null);
    try {
      const res = await fetch("/api/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (res.ok) {
        setSignStatus("success");
      } else {
        setSignStatus("error");
        setSignError((await res.text()) || `Error ${res.status}`);
      }
    } catch (err) {
      setSignStatus("error");
      setSignError(err instanceof Error ? err.message : "Error de red");
    }
  }

  function getSignatoryByRep(rep: number) {
    return request.Documents.flatMap((doc) => doc.SingSetting.Signatories)
      .find((sig) => sig.SigningRepresentative === rep);
  }

  async function registerDocumentOwner(signingRepresentative: number) {
    if (ownerStatuses[signingRepresentative] === "loading") return;
    const sig = getSignatoryByRep(signingRepresentative);
    if (!sig) return;

    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const label = PARTICIPANT_LABELS[signingRepresentative] ?? `Tipo ${signingRepresentative}`;

    setOwnerStatuses((prev) => ({ ...prev, [signingRepresentative]: "loading" }));
    setOwnerJobIds((prev) => ({ ...prev, [signingRepresentative]: jobId }));

    const baseJob = {
      id: jobId,
      documentId: "",
      documentName: "Document Owner",
      signingRepresentative,
      participantLabel: label,
      interviewId: sig.InterviewId,
      directoryId: request.DocumentDirectoryId,
      clientGuid: sig.ClientGuid,
      startedAt: now,
    };

    saveJob({ ...baseJob, status: "loading" });

    const requestBody = JSON.stringify({
      InterviewId: sig.InterviewId,
      DirectoryId: request.DocumentDirectoryId,
      ClientGuid: sig.ClientGuid,
      FlowType: request.FlowType,
    });

    try {
      const res = await fetch("/api/document-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      const text = await res.text();
      const payloadFile = res.headers.get("X-Reprocess-Payload-File") ?? undefined;
      const postUrl = res.headers.get("X-Reprocess-Post-Url") ?? undefined;
      const curlCommand = postUrl ? buildCurlCommand(postUrl, requestBody) : undefined;
      let response: unknown;
      try { response = JSON.parse(text); } catch { response = text; }
      const status: OwnerStatus = res.ok ? "completed" : "error";
      saveJob({ ...baseJob, status, response, payloadFile, postUrl, curlCommand, completedAt: new Date().toISOString() });
      setOwnerStatuses((prev) => ({ ...prev, [signingRepresentative]: status }));
    } catch (err) {
      saveJob({
        ...baseJob,
        status: "error",
        response: err instanceof Error ? err.message : String(err),
        completedAt: new Date().toISOString(),
      });
      setOwnerStatuses((prev) => ({ ...prev, [signingRepresentative]: "error" }));
    }
  }

  const titular = getParticipantPanelInfo(request, 2);
  const codeudor = getParticipantPanelInfo(request, 3);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-200">
        <button type="button" onClick={() => setExpanded(!expanded)} className="flex items-center gap-4 flex-1 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-sm font-bold">
            {index + 1}
          </span>
          <div>
            <p className="font-mono text-xs text-gray-500 mb-0.5">Dir: {request.DocumentDirectoryId}</p>
            <p className="text-sm font-semibold text-gray-800">
              Canal {request.Channel} — Flujo {request.FlowType}
              <span className="ml-3 text-xs font-normal text-gray-500">
                {request.Documents.length} {request.Documents.length === 1 ? "documento" : "documentos"}
              </span>
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 ml-4">
          <button
            type="button"
            onClick={handleSign}
            disabled={signStatus === "loading"}
            title="Firmar préstamo"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${SIGN_BUTTON_CLASS[signStatus]}`}
          >
            {signStatus === "loading" ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> :
             signStatus === "success" ? <CheckIcon className="h-3.5 w-3.5" /> :
             signStatus === "error" ? <XIcon className="h-3.5 w-3.5" /> :
             <PenIcon className="h-3.5 w-3.5" />}
            {SIGN_LABEL[signStatus]}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors"
            title={expanded ? "Colapsar" : "Expandir"}
          >
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
            title="Eliminar solicitud"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {signStatus === "error" && signError && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 font-mono">
          {signError}
        </div>
      )}

      {expanded && (
        <div className="px-5 py-4 space-y-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <PanelValue label="Id titular" value={titular.id} />
            <PanelValue label="Id codeudor" value={codeudor.id} />
            <PanelValue label="Dir. documentos titular" value={titular.documentDirectoryId} />
            <PanelValue label="Dir. documentos codeudor" value={codeudor.documentDirectoryId} />
            <PanelValue label="InterviewId titular" value={titular.interviewId} />
            <PanelValue label="InterviewId codeudor" value={codeudor.interviewId} />
            <div>
              <dt className="text-xs text-gray-400">Owner completo</dt>
              <dd>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${request.DocumentOwnerComplete ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {request.DocumentOwnerComplete ? "Sí" : "No"}
                </span>
              </dd>
            </div>
          </dl>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Document Owner</p>
            <div className="flex flex-wrap gap-2">
              {([{ rep: 2, label: "Titular" }, { rep: 3, label: "Codeudor" }] as const).map(({ rep, label }) => {
                const sig = getSignatoryByRep(rep);
                if (!sig) return null;
                const status = ownerStatuses[rep] ?? "idle";
                const jobId = ownerJobIds[rep];
                const isLoading = status === "loading";
                const btnClass =
                  isLoading ? "bg-purple-600 text-white opacity-70 cursor-not-allowed" :
                  status === "completed" ? "bg-green-100 text-green-700 hover:bg-green-200" :
                  status === "error" ? "bg-red-100 text-red-700 hover:bg-red-200" :
                  "bg-purple-600 text-white hover:bg-purple-700";
                return (
                  <div key={rep} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => registerDocumentOwner(rep)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${btnClass}`}
                    >
                      {isLoading ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> :
                       status === "completed" ? <CheckIcon className="h-3.5 w-3.5" /> :
                       status === "error" ? <XIcon className="h-3.5 w-3.5" /> : null}
                      {isLoading ? "Registrando…" :
                       status === "completed" ? `Owner ${label} ok` :
                       status === "error" ? `Error ${label} — reintentar` :
                       `Registrar Owner ${label}`}
                    </button>
                    {jobId && (
                      <button
                        type="button"
                        onClick={() => router.push(`/reprocess/${jobId}`)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Ver detalle
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Documentos ({request.Documents.length})
            </p>
            <DocumentsTable docs={request.Documents} directoryId={request.DocumentDirectoryId} />
          </div>
        </div>
      )}
    </div>
  );
}
