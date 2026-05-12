# Status Buttons per Cell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-row "Reprocesar" button and per-cell checkboxes in `DocumentsTable` with circular status buttons that trigger per-cell reprocessing, and enable right-click navigation to the job detail page.

**Architecture:** All changes are confined to `app/components/documents-table.tsx`. Remove the "Acción" column and checkbox logic; replace with a `reprocessCell` function and a status button per participant cell. Add `useRouter` for right-click navigation.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS

---

## File Map

| File | Action |
|------|--------|
| `app/components/documents-table.tsx` | Modify — main and only changed file |

---

### Task 1: Remove "Acción" column and checkbox state

**Files:**
- Modify: `app/components/documents-table.tsx`

- [ ] **Step 1: Remove `selections` state, `needsReprocess`, `toggle`, and `reprocessRow`**

Delete these from the component (lines ~24-161 in current file):

```tsx
// DELETE: selections state initialization
const [selections, setSelections] = useState<Selections>(() => { ... });

// DELETE: useEffect that syncs selections
useEffect(() => { setGlobalSelections(...) }, [selections]);

// DELETE: needsReprocess function
function needsReprocess(...) { ... }

// DELETE: toggle function
function toggle(...) { ... }

// DELETE: reprocessRow function
async function reprocessRow(...) { ... }
```

Also remove from the destructured context imports:
```tsx
// BEFORE
const { cellJobsMap, setCellJobs: setGlobalCellJobs, selectionsMap, setSelections: setGlobalSelections } =
  useSigningRequests();

// AFTER
const { cellJobsMap, setCellJobs: setGlobalCellJobs } = useSigningRequests();
```

Also remove the unused type alias at top of component:
```tsx
// DELETE
type Selections = Record<string, Set<number>>;
```

- [ ] **Step 2: Remove "Acción" `<th>` from the table header**

```tsx
// DELETE this entire <th>
<th className="py-2 px-3 text-xs font-semibold text-gray-600 border border-gray-200 text-center">Acción</th>
```

- [ ] **Step 3: Remove "Acción" `<td>` from each row**

Inside the `docs.map` loop, delete the entire last `<td>` block:
```tsx
// DELETE this entire <td>
<td className="py-2 px-3 border border-gray-200 text-center">
  <button
    type="button"
    onClick={() => reprocessRow(doc)}
    disabled={!hasAnyPending}
    className="rounded px-2.5 py-1 text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
  >
    Reprocesar
  </button>
</td>
```

Also delete `hasAnyPending` (it was only used by that button):
```tsx
// DELETE
const hasAnyPending = doc.SingSetting.Signatories.some(
  (sig) =>
    !selections[doc.DocumentId]?.has(sig.SigningRepresentative) ||
    needsReprocess(doc.DocumentId, sig.SigningRepresentative)
);
```

- [ ] **Step 4: Commit**

```bash
git add app/components/documents-table.tsx
git commit -m "refactor: remove reprocesar button and checkbox state from DocumentsTable"
```

---

### Task 2: Add `reprocessCell` and `useRouter`

**Files:**
- Modify: `app/components/documents-table.tsx`

- [ ] **Step 1: Add `useRouter` import**

```tsx
// BEFORE (top of file)
import { useState, useEffect, useRef } from "react";

// AFTER
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
```

- [ ] **Step 2: Instantiate router inside the component**

Add after the existing state declarations:
```tsx
const router = useRouter();
```

- [ ] **Step 3: Add the `reprocessCell` function**

Add this function inside `DocumentsTable`, after the `jobStates` state and its `useEffect`:

```tsx
async function reprocessCell(doc: SigningDocument, sig: SigningDocument["SingSetting"]["Signatories"][number]) {
  const key = cellKey(doc.DocumentId, sig.SigningRepresentative);
  const existingJobId = cellJobs[key];

  // Block double calls while loading
  if (existingJobId) {
    const existing = jobStates[existingJobId];
    if (!existing || existing.status === "loading") return;
  }

  const docName = DOCUMENT_NAMES[doc.DocumentType] || doc.TopicName || `Tipo ${doc.DocumentType}`;
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

  setGlobalCellJobs(directoryId, { ...cellJobs, [key]: jobId });

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
```

- [ ] **Step 4: Commit**

```bash
git add app/components/documents-table.tsx
git commit -m "feat: add reprocessCell function with double-call guard"
```

---

### Task 3: Replace cell content with status buttons

**Files:**
- Modify: `app/components/documents-table.tsx`

- [ ] **Step 1: Replace the participant cell rendering**

The current `sortedTypes.map` inside the row renders two different `<td>` blocks (one with a Link/icon when jobId exists, one with a checkbox otherwise). Replace **both** with a single unified `<td>`:

```tsx
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
```

- [ ] **Step 2: Remove the now-unused `Link` import (if only used for the old cell links)**

Check the top of the file. If `Link` from `next/link` is no longer referenced anywhere after the changes, remove it:

```tsx
// DELETE if unused:
import Link from "next/link";
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: no errors. If errors appear, check that the `sig` type used in `reprocessCell` matches the signatory shape from `SigningDocument["SingSetting"]["Signatories"][number]`.

- [ ] **Step 4: Commit**

```bash
git add app/components/documents-table.tsx
git commit -m "feat: replace checkboxes with status buttons and right-click detail navigation"
```

---

### Task 4: Manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Load a signing request and open the list**

Open `http://localhost:3000`, paste a valid `SigningRequest` JSON, and click "Agregar a lista". Expand the card.

- [ ] **Step 3: Verify blue "O" buttons appear**

Every participant cell with a signatory should show a small circular blue button with the letter `O`. Cells without a signatory should be gray and on a red background.

- [ ] **Step 4: Verify click triggers reprocessing (yellow spinner)**

Click a blue button. It should immediately turn yellow with a spinning icon and become unclickable while the API call is in progress.

- [ ] **Step 5: Verify success/error state after API response**

After the API responds:
- If the call succeeded → button turns green with a checkmark
- If the call failed → button turns red with an X

- [ ] **Step 6: Verify re-reprocess on green/red**

Click a green or red button. It should trigger a new reprocess cycle (yellow spinner appears again).

- [ ] **Step 7: Verify right-click navigates to detail**

Right-click a button that has an active job (yellow, green, or red). The browser's native context menu should NOT appear. Instead, the page should navigate to `/reprocess/{jobId}`.

- [ ] **Step 8: Verify the "Reprocesar" button is gone**

Confirm no "Acción" column header and no "Reprocesar" button exist in the table.
