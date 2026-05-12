"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { SigningDocument, ReprocessJob } from "../types/signing-request";
import { saveJob, getJob } from "../lib/reprocess-jobs";
import { useSigningRequests } from "../context/signing-requests";
import { DOCUMENT_NAMES, PARTICIPANT_LABELS, API_BASE } from "../lib/constants";
import { SpinnerIcon, CheckIcon, XIcon } from "./icons";

type CellJobs = Record<string, string>; // `${documentId}::${signingRepresentative}` → jobId

const cellKey = (docId: string, type: number) => `${docId}::${type}`;

export function DocumentsTable({ docs, directoryId }: { docs: SigningDocument[]; directoryId: string }) {
  const router = useRouter();
  const { cellJobsMap, setCellJobs: setGlobalCellJobs } = useSigningRequests();

  const sortedTypes = [
    ...new Set(docs.flatMap((doc) => doc.SingSetting.Signatories.map((s) => s.SigningRepresentative))),
  ].sort((a, b) => a - b);

  const cellJobs: CellJobs = cellJobsMap[directoryId] ?? {};
  const cellJobsRef = useRef(cellJobs);
  cellJobsRef.current = cellJobs;

  const [jobStates, setJobStates] = useState<Record<string, ReprocessJob>>({});

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

  async function reprocessCell(doc: SigningDocument, sig: SigningDocument["SingSetting"]["Signatories"][number]) {
    const key = cellKey(doc.DocumentId, sig.SigningRepresentative);
    const existingJobId = cellJobsRef.current[key];

    // Block double calls while loading
    if (existingJobId) {
      const existing = jobStates[existingJobId];
      if (!existing || existing.status === "loading") return;
    }

    const docName = DOCUMENT_NAMES[String(doc.DocumentType)] || doc.TopicName || `Tipo ${doc.DocumentType}`;
    const now = new Date().toISOString();
    const jobId = crypto.randomUUID();

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

    setGlobalCellJobs(directoryId, { ...cellJobsRef.current, [key]: jobId });

    const baseJob = {
      id: jobId,
      documentId: doc.DocumentId,
      documentName: docName,
      signingRepresentative: sig.SigningRepresentative,
      participantLabel: PARTICIPANT_LABELS[sig.SigningRepresentative] ?? `Tipo ${sig.SigningRepresentative}`,
      interviewId: sig.InterviewId,
      directoryId,
      startedAt: now,
    };

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
      const text = await res.text();
      let response: unknown;
      try { response = JSON.parse(text); } catch { response = text; }
      saveJob({ ...baseJob, status: res.ok ? "completed" : "error", response, completedAt: new Date().toISOString() });
    } catch (err) {
      saveJob({
        ...baseJob,
        status: "error",
        response: err instanceof Error ? err.message : String(err),
        completedAt: new Date().toISOString(),
      });
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="py-2 px-3 text-xs font-semibold text-gray-600 border border-gray-200">Documento</th>
            {sortedTypes.map((type) => (
              <th key={type} className="py-2 px-3 text-xs font-semibold text-gray-600 border border-gray-200 text-center whitespace-nowrap">
                {PARTICIPANT_LABELS[type] ?? "Firma"} ({type})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((doc, i) => (
            <tr key={doc.DocumentId} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="py-2 px-3 border border-gray-200 font-medium text-gray-800">
                {DOCUMENT_NAMES[doc.DocumentType] || doc.TopicName || `Tipo ${doc.DocumentType}`}
              </td>
              {sortedTypes.map((type) => {
                const hasSignatory = doc.SingSetting.Signatories.some((s) => s.SigningRepresentative === type);
                const sig = doc.SingSetting.Signatories.find((s) => s.SigningRepresentative === type);
                const jobId = cellJobs[cellKey(doc.DocumentId, type)];
                const j = jobId ? jobStates[jobId] : undefined;

                const isLoading = !!jobId && (!j || (j.status === "loading" && !j.manualResult));
                const isSuccess = !!j && (j.manualResult === "success" || (j.status === "completed" && !j.manualResult));
                const isError = !!j && (j.manualResult === "failed" || (j.status === "error" && !j.manualResult));

                let btnClass = "bg-blue-600 hover:bg-blue-700"; // idle default
                if (!hasSignatory) btnClass = "bg-gray-300 cursor-not-allowed";
                else if (isLoading) btnClass = "bg-yellow-400 cursor-not-allowed";
                else if (isSuccess) btnClass = "bg-green-500 hover:bg-green-600";
                else if (isError) btnClass = "bg-red-500 hover:bg-red-600";

                return (
                  <td
                    key={type}
                    className={`py-2 px-3 border border-gray-200 text-center ${!hasSignatory ? "bg-red-50" : ""}`}
                  >
                    <button
                      type="button"
                      disabled={!hasSignatory || isLoading}
                      onClick={() => sig && reprocessCell(doc, sig)}
                      onContextMenu={(e) => {
                        if (!jobId) return;
                        e.preventDefault();
                        router.push(`/reprocess/${jobId}`);
                      }}
                      title={
                        !hasSignatory
                          ? "Sin firmante"
                          : jobId
                          ? "Click: reprocesar · Click derecho: ver detalle"
                          : "Click: reprocesar"
                      }
                      className={`w-7 h-7 rounded-full text-white inline-flex items-center justify-center transition-colors disabled:opacity-70 ${btnClass}`}
                    >
                      {isLoading ? (
                        <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                      ) : isSuccess ? (
                        <CheckIcon className="h-3.5 w-3.5" />
                      ) : isError ? (
                        <XIcon className="h-3.5 w-3.5" />
                      ) : (
                        <span className="text-xs font-bold leading-none">O</span>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
