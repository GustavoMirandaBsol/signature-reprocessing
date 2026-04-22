"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { SigningRequest } from "../types/signing-request";

type CellJobs = Record<string, string>; // `${documentId}::${signingRepresentative}` → jobId
// documentId → array of checked signingRepresentative numbers (Set serialized as array)
type SelectionsRecord = Record<string, number[]>;

interface State {
  requests: SigningRequest[];
  cellJobsMap: Record<string, CellJobs>;       // directoryId → CellJobs
  selectionsMap: Record<string, SelectionsRecord>; // directoryId → SelectionsRecord
  expandedMap: Record<string, boolean>;         // directoryId → expanded
}

interface ContextValue extends State {
  addRequest: (req: SigningRequest) => void;
  removeRequest: (index: number) => void;
  clearAll: () => void;
  setCellJobs: (directoryId: string, jobs: CellJobs) => void;
  setSelections: (directoryId: string, sels: SelectionsRecord) => void;
  setExpanded: (directoryId: string, expanded: boolean) => void;
}

const STORAGE_KEY = "signing_requests_state";

const EMPTY: State = { requests: [], cellJobsMap: {}, selectionsMap: {}, expandedMap: {} };

function loadState(): State {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      requests: parsed.requests ?? [],
      cellJobsMap: parsed.cellJobsMap ?? {},
      selectionsMap: parsed.selectionsMap ?? {},
      expandedMap: parsed.expandedMap ?? {},
    };
  } catch {
    return EMPTY;
  }
}

const Ctx = createContext<ContextValue | null>(null);

export function SigningRequestsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  function addRequest(req: SigningRequest) {
    setState((prev) => ({ ...prev, requests: [...prev.requests, req] }));
  }

  function removeRequest(index: number) {
    setState((prev) => ({
      ...prev,
      requests: prev.requests.filter((_, i) => i !== index),
    }));
  }

  function clearAll() {
    setState((prev) => ({ ...prev, requests: [], cellJobsMap: {}, selectionsMap: {} }));
  }

  function setCellJobs(directoryId: string, jobs: CellJobs) {
    setState((prev) => ({
      ...prev,
      cellJobsMap: { ...prev.cellJobsMap, [directoryId]: jobs },
    }));
  }

  function setSelections(directoryId: string, sels: SelectionsRecord) {
    setState((prev) => ({
      ...prev,
      selectionsMap: { ...prev.selectionsMap, [directoryId]: sels },
    }));
  }

  function setExpanded(directoryId: string, expanded: boolean) {
    setState((prev) => ({
      ...prev,
      expandedMap: { ...prev.expandedMap, [directoryId]: expanded },
    }));
  }

  return (
    <Ctx.Provider
      value={{ ...state, addRequest, removeRequest, clearAll, setCellJobs, setSelections, setExpanded }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSigningRequests() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error(
      "useSigningRequests must be used inside SigningRequestsProvider"
    );
  return ctx;
}
