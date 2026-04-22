"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ReprocessJob } from "../../types/signing-request";
import { getJob, saveJob } from "../../lib/reprocess-jobs";

function elapsedLabel(startedAt: string, completedAt?: string): string {
  const from = new Date(startedAt).getTime();
  const to = completedAt ? new Date(completedAt).getTime() : Date.now();
  const secs = Math.floor((to - from) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins < 60) return `${mins}m ${rem}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function ReprocessDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const [job, setJob] = useState<ReprocessJob | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [notFound, setNotFound] = useState(false);

  const reload = useCallback(() => {
    const j = getJob(id);
    if (!j) {
      setNotFound(true);
      return;
    }
    setJob(j);
    setElapsed(elapsedLabel(j.startedAt, j.completedAt));
  }, [id]);

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 1000);
    return () => clearInterval(interval);
  }, [reload]);

  function setManualResult(result: "success" | "failed" | null) {
    if (!job) return;
    const updated: ReprocessJob = { ...job, manualResult: result };
    saveJob(updated);
    setJob(updated);
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-gray-500 text-sm">No se encontró el reproceso con ID: <code className="font-mono text-xs bg-gray-100 px-1 rounded">{id}</code></p>
          <Link href="/" className="text-blue-600 text-sm hover:underline">← Volver</Link>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  const statusColors: Record<ReprocessJob["status"], string> = {
    loading: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };

  const statusLabels: Record<ReprocessJob["status"], string> = {
    loading: "En proceso",
    completed: "Completado",
    error: "Error",
  };

  const manualColors = {
    success: "bg-green-100 text-green-700 border-green-300",
    failed: "bg-red-100 text-red-700 border-red-300",
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Detalle de reproceso</h1>
        </div>

        {/* Status banner */}
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${statusColors[job.status]}`}>
          {job.status === "loading" && (
            <svg className="h-5 w-5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {job.status === "completed" && (
            <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {job.status === "error" && (
            <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <div>
            <p className="font-semibold text-sm">{statusLabels[job.status]}</p>
            <p className="text-xs opacity-80">
              Tiempo transcurrido: <span className="font-mono font-bold">{elapsed}</span>
            </p>
          </div>
        </div>

        {/* Job details */}
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

        {/* API Response */}
        {job.response !== undefined && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Respuesta del API
              </p>
            </div>
            <div className="p-4">
              <pre className="text-xs text-gray-800 whitespace-pre-wrap break-all font-mono bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                {typeof job.response === "string"
                  ? job.response
                  : JSON.stringify(job.response, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Manual result */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Resultado manual
          </p>
          <p className="text-sm text-gray-600">
            Marca el resultado manualmente si lo conoces:
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setManualResult(job.manualResult === "success" ? null : "success")}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                job.manualResult === "success"
                  ? manualColors.success
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              ✓ Exitoso
            </button>
            <button
              type="button"
              onClick={() => setManualResult(job.manualResult === "failed" ? null : "failed")}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                job.manualResult === "failed"
                  ? manualColors.failed
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              ✗ Fallido
            </button>
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
