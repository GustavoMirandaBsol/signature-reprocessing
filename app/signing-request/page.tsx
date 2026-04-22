"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { SigningRequest, SigningDocument, Signatory, ReprocessJob } from "../types/signing-request";
import { saveJob, getJob } from "../lib/reprocess-jobs";
import { useSigningRequests } from "../context/signing-requests";

function unwrapValues<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (val && typeof val === "object" && "$values" in (val as object))
    return (val as { $values: T[] }).$values;
  return [];
}

function parseJson(raw: string): SigningRequest {
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("El JSON no tiene el formato esperado.");
  }

  // Wrapped format: { Input: { FlowType, DocumentDirectoryId, Documents: { $values: [...] }, ... } }
  const input =
    "Input" in parsed && typeof parsed.Input === "object" && parsed.Input !== null
      ? parsed.Input
      : parsed;

  const docs = unwrapValues<Record<string, unknown>>(input.Documents);
  if (docs.length === 0) {
    throw new Error("El JSON no contiene documentos.");
  }

  const documents: SigningDocument[] = docs.map((doc) => {
    const singSettingRaw =
      doc.SingSetting && typeof doc.SingSetting === "object" ? doc.SingSetting : {};
    const signatories = unwrapValues<Signatory>(
      (singSettingRaw as Record<string, unknown>).Signatories
    );
    return {
      DocumentId: doc.DocumentId as string,
      DocumentType: doc.DocumentType as number,
      TopicName: (doc.TopicName as string) ?? "",
      SingSetting: { Signatories: signatories },
    };
  });

  return {
    FlowType: input.FlowType as number,
    DocumentDirectoryId: input.DocumentDirectoryId as string,
    Channel: input.Channel as number,
    DocumentOwnerComplete: input.DocumentOwnerComplete as boolean,
    NotificationSignedDocument: (input.NotificationSignedDocument as string | null) ?? null,
    Documents: documents,
  };
}

const DOCUMENT_NAMES: Record<string, string> = {
  "3": "POLIZA DE SEGURO LBC",
  "4": "ACUERDO DE CONDICIONES DE CREDITO",
  "5": "TABLA DE AMORTIZACION",
  "6": "RESOLUCION DE CREDITO",
  "10": "CONTRATO Individual",
  "12": "CONTRATO sector productivo",
  "14": "AUTORIZACION DE CANCELACION",
  "16": "FORMULARIO DE SOLICITUD DIGICERT",
};

const PARTICIPANT_LABELS: Record<number, string> = {
  0: "Firma Representante",
  2: "Firma Titular",
  3: "Firma Codeudor",
  4: "Firma Corporativo",
};

const API_BASE = "/api/reprocess";

// cellKey = `${documentId}::${signingRepresentative}`
type CellJobs = Record<string, string>; // cellKey → jobId

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar"
      className="shrink-0 rounded p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
    >
      {copied ? (
        <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

// ── DocumentsTable ────────────────────────────────────────────────────────────

type Selections = Record<string, Set<number>>;

function DocumentsTable({
  docs,
  directoryId,
}: {
  docs: SigningDocument[];
  directoryId: string;
}) {
  const {
    cellJobsMap,
    setCellJobs: setGlobalCellJobs,
    selectionsMap,
    setSelections: setGlobalSelections,
  } = useSigningRequests();

  const presentTypes = new Set<number>();
  for (const doc of docs) {
    for (const sig of doc.SingSetting.Signatories) {
      presentTypes.add(sig.SigningRepresentative);
    }
  }
  const sortedTypes = [...presentTypes].sort((a, b) => a - b);

  const [selections, setSelections] = useState<Selections>(() => {
    const stored = selectionsMap[directoryId];
    if (stored) {
      return Object.fromEntries(
        Object.entries(stored).map(([docId, types]) => [docId, new Set(types)])
      );
    }
    const init: Selections = {};
    for (const doc of docs) {
      const checked = new Set<number>();
      for (const sig of doc.SingSetting.Signatories) {
        checked.add(sig.SigningRepresentative);
      }
      init[doc.DocumentId] = checked;
    }
    return init;
  });

  useEffect(() => {
    setGlobalSelections(
      directoryId,
      Object.fromEntries(
        Object.entries(selections).map(([docId, s]) => [docId, [...s]])
      )
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections]);

  const cellJobs: CellJobs = cellJobsMap[directoryId] ?? {};

  function setCellJobs(updater: (prev: CellJobs) => CellJobs) {
    setGlobalCellJobs(directoryId, updater(cellJobs));
  }

  const [jobStates, setJobStates] = useState<Record<string, ReprocessJob>>({});
  const cellJobsRef = useRef(cellJobs);
  cellJobsRef.current = cellJobs;

  useEffect(() => {
    function refresh() {
      const ids = Object.values(cellJobsRef.current);
      if (ids.length === 0) return;
      setJobStates((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const jobId of ids) {
          const j = getJob(jobId);
          if (j && (prev[jobId]?.status !== j.status || prev[jobId]?.manualResult !== j.manualResult)) {
            next[jobId] = j;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, []);

  function isCellError(docId: string, type: number): boolean {
    const jobId = cellJobs[`${docId}::${type}`];
    if (!jobId) return false;
    const j = jobStates[jobId];
    return !!j && (j.status === "error" || j.manualResult === "failed");
  }

  function toggle(docId: string, type: number) {
    setSelections((prev) => {
      const current = new Set(prev[docId] ?? []);
      if (current.has(type)) current.delete(type);
      else current.add(type);
      return { ...prev, [docId]: current };
    });
  }

  async function reprocessRow(doc: SigningDocument) {
    const docName =
      DOCUMENT_NAMES[doc.DocumentType] || doc.TopicName || `Tipo ${doc.DocumentType}`;

    // collect signatories that are unchecked OR whose last job ended in error/failed
    const pending = doc.SingSetting.Signatories.filter(
      (sig) =>
        !selections[doc.DocumentId]?.has(sig.SigningRepresentative) ||
        isCellError(doc.DocumentId, sig.SigningRepresentative)
    );

    if (pending.length === 0) return;

    // create jobs in localStorage immediately so detail page can show them
    const now = new Date().toISOString();
    const newCells: CellJobs = {};

    for (const sig of pending) {
      const jobId = crypto.randomUUID();
      const cellKey = `${doc.DocumentId}::${sig.SigningRepresentative}`;
      newCells[cellKey] = jobId;

      saveJob({
        id: jobId,
        documentId: doc.DocumentId,
        documentName: docName,
        signingRepresentative: sig.SigningRepresentative,
        participantLabel: PARTICIPANT_LABELS[sig.SigningRepresentative] ?? `Tipo ${sig.SigningRepresentative}`,
        interviewId: sig.InterviewId,
        directoryId,
        startedAt: now,
        status: "loading",
      });
    }

    setCellJobs((prev) => ({ ...prev, ...newCells }));

    // fire all requests concurrently
    await Promise.all(
      pending.map(async (sig) => {
        const jobId = newCells[`${doc.DocumentId}::${sig.SigningRepresentative}`];
        try {
          const res = await fetch(`${API_BASE}/${doc.DocumentId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              InterviewId: sig.InterviewId,
              DirectoryId: directoryId,
              FlowType: 0,
              SigningRepresentative: sig.SigningRepresentative,
            }),
          });
          const responseText = await res.text();
          let responseData: unknown;
          try {
            responseData = JSON.parse(responseText);
          } catch {
            responseData = responseText;
          }
          saveJob({
            id: jobId,
            documentId: doc.DocumentId,
            documentName: docName,
            signingRepresentative: sig.SigningRepresentative,
            participantLabel: PARTICIPANT_LABELS[sig.SigningRepresentative] ?? `Tipo ${sig.SigningRepresentative}`,
            interviewId: sig.InterviewId,
            directoryId,
            startedAt: now,
            status: res.ok ? "completed" : "error",
            response: responseData,
            completedAt: new Date().toISOString(),
          });
          if (res.ok) {
            setSelections((prev) => {
              const current = new Set(prev[doc.DocumentId] ?? []);
              current.add(sig.SigningRepresentative);
              return { ...prev, [doc.DocumentId]: current };
            });
          }
        } catch (err) {
          saveJob({
            id: jobId,
            documentId: doc.DocumentId,
            documentName: docName,
            signingRepresentative: sig.SigningRepresentative,
            participantLabel: PARTICIPANT_LABELS[sig.SigningRepresentative] ?? `Tipo ${sig.SigningRepresentative}`,
            interviewId: sig.InterviewId,
            directoryId,
            startedAt: now,
            status: "error",
            response: err instanceof Error ? err.message : String(err),
            completedAt: new Date().toISOString(),
          });
        }
      })
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="py-2 px-3 text-xs font-semibold text-gray-600 border border-gray-200">
              Documento
            </th>
            {sortedTypes.map((type) => (
              <th
                key={type}
                className="py-2 px-3 text-xs font-semibold text-gray-600 border border-gray-200 text-center whitespace-nowrap"
              >
                {PARTICIPANT_LABELS[type] ?? `Firma`} ({type})
              </th>
            ))}
            <th className="py-2 px-3 text-xs font-semibold text-gray-600 border border-gray-200 text-center">
              Acción
            </th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc, i) => {
            const hasAnyUnchecked = doc.SingSetting.Signatories.some(
              (sig) =>
                !selections[doc.DocumentId]?.has(sig.SigningRepresentative) ||
                isCellError(doc.DocumentId, sig.SigningRepresentative)
            );
            return (
              <tr key={doc.DocumentId} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="py-2 px-3 border border-gray-200 font-medium text-gray-800">
                  {DOCUMENT_NAMES[doc.DocumentType] || doc.TopicName || `Tipo ${doc.DocumentType}`}
                </td>
                {sortedTypes.map((type) => {
                  const hasSignatory = doc.SingSetting.Signatories.some(
                    (s) => s.SigningRepresentative === type
                  );
                  const cellKey = `${doc.DocumentId}::${type}`;
                  const jobId = cellJobs[cellKey];

                  if (jobId) {
                    const jobState = jobStates[jobId];
                    const isLoading = !jobState || (jobState.status === "loading" && !jobState.manualResult);
                    const isSuccess =
                      jobState?.manualResult === "success" ||
                      (jobState?.status === "completed" && !jobState.manualResult);

                    return (
                      <td
                        key={type}
                        className="py-2 px-3 border border-gray-200 text-center"
                      >
                        <Link
                          href={`/reprocess/${jobId}`}
                          title="Ver detalle del reproceso"
                          className="inline-flex items-center justify-center"
                        >
                          {isLoading ? (
                            <svg className="h-4 w-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : isSuccess ? (
                            <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </Link>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={type}
                      className={`py-2 px-3 border border-gray-200 text-center ${
                        !hasSignatory ? "bg-red-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selections[doc.DocumentId]?.has(type) ?? false}
                        onChange={() => toggle(doc.DocumentId, type)}
                        disabled={!hasSignatory}
                        className={`h-4 w-4 rounded border-gray-300 ${
                          hasSignatory
                            ? "text-blue-600 focus:ring-blue-500 cursor-pointer"
                            : "cursor-not-allowed opacity-30"
                        }`}
                      />
                    </td>
                  );
                })}
                <td className="py-2 px-3 border border-gray-200 text-center">
                  <button
                    type="button"
                    onClick={() => reprocessRow(doc)}
                    disabled={!hasAnyUnchecked}
                    className="rounded px-2.5 py-1 text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Reprocesar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── RequestCard ───────────────────────────────────────────────────────────────

function RequestCard({
  request,
  index,
  onRemove,
}: {
  request: SigningRequest;
  index: number;
  onRemove: () => void;
}) {
  const { expandedMap, setExpanded: setGlobalExpanded } = useSigningRequests();
  const expanded = expandedMap[request.DocumentDirectoryId] ?? false;
  function setExpanded(val: boolean) {
    setGlobalExpanded(request.DocumentDirectoryId, val);
  }

  const titularId =
    request.Documents.flatMap((d) => d.SingSetting.Signatories)
      .find((s) => s.SigningRepresentative === 2)?.ClientGuid ?? "—";

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-4 flex-1 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-sm font-bold">
            {index + 1}
          </span>
          <div>
            <p className="font-mono text-xs text-gray-500 mb-0.5">
              Dir: {request.DocumentDirectoryId}
            </p>
            <p className="text-sm font-semibold text-gray-800">
              Canal {request.Channel} — Flujo {request.FlowType}
              <span className="ml-3 text-xs font-normal text-gray-500">
                {request.Documents.length}{" "}
                {request.Documents.length === 1 ? "documento" : "documentos"}
              </span>
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2 ml-4">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors"
            title={expanded ? "Colapsar" : "Expandir"}
          >
            <svg
              className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
            title="Eliminar solicitud"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 py-4 space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-gray-400">Id titular</dt>
              <dd className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-gray-600 truncate">{titularId}</span>
                <CopyButton text={titularId} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Dir. documentos</dt>
              <dd className="font-mono text-xs text-gray-600 truncate">
                {request.DocumentDirectoryId}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Owner completo</dt>
              <dd>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    request.DocumentOwnerComplete
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {request.DocumentOwnerComplete ? "Sí" : "No"}
                </span>
              </dd>
            </div>
          </dl>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Documentos ({request.Documents.length})
            </p>
            <DocumentsTable
              docs={request.Documents}
              directoryId={request.DocumentDirectoryId}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function SigningRequestPage() {
  const { requests, addRequest, removeRequest, clearAll } = useSigningRequests();
  const [rawJson, setRawJson] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleLoad() {
    setError(null);
    try {
      const parsed = parseJson(rawJson.trim());
      addRequest(parsed);
      setRawJson("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "JSON inválido.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Solicitudes de firma</h1>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
            Cargar JSON
          </h2>
          <textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            placeholder="Pega aquí el JSON con el formato SigningRequest…"
            rows={8}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={handleLoad}
            disabled={!rawJson.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Agregar a lista
          </button>
        </section>

        {requests.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                Lista de solicitudes ({requests.length})
              </h2>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
              >
                Limpiar todo
              </button>
            </div>
            {requests.map((req, i) => (
              <RequestCard
                key={i}
                request={req}
                index={i}
                onRemove={() => removeRequest(i)}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
