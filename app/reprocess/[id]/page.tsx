"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ReprocessJob } from "../../types/signing-request";
import { getJob, saveJob } from "../../lib/reprocess-jobs";
import { SpinnerIcon, CheckIcon, XIcon, BackArrowIcon } from "../../components/icons";
import { CopyButton } from "../../components/copy-button";

function elapsedLabel(startedAt: string, completedAt?: string): string {
  const secs = Math.floor(
    ((completedAt ? new Date(completedAt) : new Date()).getTime() - new Date(startedAt).getTime()) / 1000
  );
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const STATUS_COLORS: Record<ReprocessJob["status"], string> = {
  loading: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<ReprocessJob["status"], string> = {
  loading: "En proceso",
  completed: "Completado",
  error: "Error",
};

const MANUAL_COLORS: Record<"success" | "failed", string> = {
  success: "bg-green-100 text-green-700 border-green-300",
  failed: "bg-red-100 text-red-700 border-red-300",
};

function getJobSnapshot(id: string): { job: ReprocessJob | null; elapsed: string } {
  const job = getJob(id);
  return {
    job,
    elapsed: job ? elapsedLabel(job.startedAt, job.completedAt) : "",
  };
}

export default function ReprocessDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string) ?? "";

  const [snapshot, setSnapshot] = useState(() => getJobSnapshot(id));

  const reload = useCallback(() => {
    setSnapshot(getJobSnapshot(id));
  }, [id]);

  useEffect(() => {
    const initial = setTimeout(reload, 0);
    const interval = setInterval(reload, 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [reload]);

  const { job, elapsed } = snapshot;

  function setManualResult(result: "success" | "failed" | null): void {
    if (!job) return;
    const updated = { ...job, manualResult: result };
    saveJob(updated);
    setSnapshot({ job: updated, elapsed: elapsedLabel(updated.startedAt, updated.completedAt) });
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-gray-500 text-sm">
            No se encontró el reproceso con ID:{" "}
            <code className="font-mono text-xs bg-gray-100 px-1 rounded">{id}</code>
          </p>
          <Link href="/" className="text-blue-600 text-sm hover:underline">← Volver</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors">
            <BackArrowIcon className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Detalle de reproceso</h1>
        </div>

        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${STATUS_COLORS[job.status]}`}>
          {job.status === "loading" && <SpinnerIcon className="h-5 w-5 animate-spin shrink-0" />}
          {job.status === "completed" && <CheckIcon className="h-5 w-5 shrink-0" />}
          {job.status === "error" && <XIcon className="h-5 w-5 shrink-0" />}
          <div>
            <p className="font-semibold text-sm">{STATUS_LABELS[job.status]}</p>
            <p className="text-xs opacity-80">
              Tiempo transcurrido: <span className="font-mono font-bold">{elapsed}</span>
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
          <div className="px-5 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Documento</p>
            <p className="font-medium text-gray-800 text-sm">{job.documentName}</p>
            <p className="font-mono text-xs text-gray-500">{job.documentId}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Participante</p>
            <p className="font-medium text-gray-800 text-sm">
              {job.participantLabel}{" "}
              <span className="text-gray-400 text-xs">({job.signingRepresentative})</span>
            </p>
          </div>
          <div className="px-5 py-3">
            <p className="text-xs text-gray-400 mb-0.5">InterviewId</p>
            <p className="font-mono text-xs text-gray-700">{job.interviewId}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-xs text-gray-400 mb-0.5">DirectoryId</p>
            <p className="font-mono text-xs text-gray-700">{job.directoryId}</p>
          </div>
          {job.clientGuid && (
            <div className="px-5 py-3">
              <p className="text-xs text-gray-400 mb-0.5">ClientGuid</p>
              <p className="font-mono text-xs text-gray-700">{job.clientGuid}</p>
            </div>
          )}
          {job.payloadFile && (
            <div className="px-5 py-3">
              <p className="text-xs text-gray-400 mb-0.5">Archivo payload</p>
              <p className="font-mono text-xs text-gray-700 break-all">{job.payloadFile}</p>
            </div>
          )}
          {job.postUrl && (
            <div className="px-5 py-3">
              <p className="text-xs text-gray-400 mb-0.5">URL POST</p>
              <p className="font-mono text-xs text-gray-700 break-all">{job.postUrl}</p>
            </div>
          )}
          <div className="px-5 py-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Iniciado</p>
              <p className="text-xs text-gray-700">{new Date(job.startedAt).toLocaleString()}</p>
            </div>
            {job.completedAt && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Completado</p>
                <p className="text-xs text-gray-700">{new Date(job.completedAt).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>

        {job.curlCommand && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">cURL</p>
              <CopyButton text={job.curlCommand} />
            </div>
            <div className="p-4">
              <pre className="text-xs text-gray-800 whitespace-pre-wrap break-all font-mono bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                {job.curlCommand}
              </pre>
            </div>
          </div>
        )}

        {job.response !== undefined && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Respuesta del API</p>
            </div>
            <div className="p-4">
              <pre className="text-xs text-gray-800 whitespace-pre-wrap break-all font-mono bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                {typeof job.response === "string" ? job.response : JSON.stringify(job.response, null, 2)}
              </pre>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Resultado manual</p>
          <p className="text-sm text-gray-600">Marca el resultado manualmente si lo conoces:</p>
          <div className="flex gap-3">
            {(["success", "failed"] as const).map((result) => (
              <button
                key={result}
                type="button"
                onClick={() => setManualResult(job.manualResult === result ? null : result)}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  job.manualResult === result
                    ? MANUAL_COLORS[result]
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {result === "success" ? "✓ Exitoso" : "✗ Fallido"}
              </button>
            ))}
          </div>
          {job.manualResult && (
            <p className="text-xs text-gray-400">
              Marcado como <strong>{job.manualResult === "success" ? "exitoso" : "fallido"}</strong>.
              Haz clic de nuevo para quitar la marca.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
