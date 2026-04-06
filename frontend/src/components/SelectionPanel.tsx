import { forwardRef } from 'react'
import type { AcceptedPatch, PlanResolvedEdit, RewriteProposal } from '../types/patch'

type SelectionPanelProps = {
  selectedText: string
  instruction: string
  onInstructionChange: (value: string) => void
  onRewrite: () => void
  onRegenerateProposal: () => void
  rewriteLoading: boolean
  rewriteError: string | null
  proposal: RewriteProposal | null
  onAcceptProposal: () => void
  onRejectProposal: () => void
  acceptedPatches: AcceptedPatch[]
  canExport: boolean
  exportLoading: boolean
  exportError: string | null
  onExport: () => void
  planEdits: PlanResolvedEdit[] | null
  planLoading: boolean
  planError: string | null
  onGenerateDocumentPlan: () => void
  onImportResolvedPlan: () => void
  hasPdfFile: boolean
}

export const SelectionPanel = forwardRef<HTMLElement, SelectionPanelProps>(
  function SelectionPanel(
    {
      selectedText,
      instruction,
      onInstructionChange,
      onRewrite,
      onRegenerateProposal,
      rewriteLoading,
      rewriteError,
      proposal,
      onAcceptProposal,
      onRejectProposal,
      acceptedPatches,
      canExport,
      exportLoading,
      exportError,
      onExport,
      planEdits,
      planLoading,
      planError,
      onGenerateDocumentPlan,
      onImportResolvedPlan,
      hasPdfFile,
    },
    ref,
  ) {
    const empty = selectedText.length === 0
    const canRewrite = !rewriteLoading && selectedText.trim().length > 0
    const canDecide = Boolean(proposal) && !rewriteLoading
    const canRegenerate = Boolean(proposal) && !rewriteLoading
    const resolvedCount =
      planEdits?.filter((e) => e.bbox && e.bbox.length === 4 && !e.error).length ?? 0

    return (
      <aside ref={ref} className="selection-panel" aria-label="Selection and rewrite">
        <h2 className="selection-panel-title">Selection</h2>
        <p className="selection-panel-hint">
          Highlight text in the PDF, then type an instruction (or type first—either order).
          Your excerpt stays put when you click the instruction field. Run rewrite when both
          are ready.
        </p>
        <pre className={`selection-panel-body${empty ? ' is-empty' : ''}`}>
          {empty ? 'No text selected' : selectedText}
        </pre>

        <label className="rewrite-label" htmlFor="rewrite-instruction">
          Instruction
        </label>
        <textarea
          id="rewrite-instruction"
          className="rewrite-instruction"
          rows={3}
          placeholder="e.g. simplify this"
          value={instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          disabled={rewriteLoading}
        />

        <div className="rewrite-actions-row">
          <button
            type="button"
            className="rewrite-button"
            onClick={onRewrite}
            disabled={!canRewrite}
          >
            {rewriteLoading ? 'Rewriting…' : 'Rewrite'}
          </button>
          {canRegenerate ? (
            <button
              type="button"
              className="rewrite-button rewrite-button-secondary"
              onClick={onRegenerateProposal}
              disabled={rewriteLoading}
            >
              Regenerate
            </button>
          ) : null}
        </div>

        {rewriteError ? (
          <p className="rewrite-error" role="alert">
            {rewriteError}
          </p>
        ) : null}

        <h3 className="rewrite-output-title">Replacement</h3>
        <pre
          className={`selection-panel-body rewrite-output${!proposal ? ' is-empty' : ''}`}
        >
          {!proposal
            ? rewriteLoading
              ? '…'
              : 'Run rewrite to see a proposal.'
            : proposal.replacementText}
        </pre>

        {canDecide ? (
          <div className="accept-reject-row">
            <button
              type="button"
              className="patch-button patch-button-accept"
              onClick={onAcceptProposal}
            >
              Accept
            </button>
            <button
              type="button"
              className="patch-button patch-button-reject"
              onClick={onRejectProposal}
            >
              Reject
            </button>
          </div>
        ) : null}

        <h3 className="plan-section-title">Document plan (AI)</h3>
        <p className="selection-panel-hint plan-hint">
          Uses the same instruction plus full extracted text (all pages). Requires{' '}
          <code>OPENAI_API_KEY</code> on the server. Resolved items can be added as accepted
          patches.
        </p>
        <div className="rewrite-actions-row">
          <button
            type="button"
            className="rewrite-button"
            onClick={onGenerateDocumentPlan}
            disabled={!hasPdfFile || planLoading || !instruction.trim()}
          >
            {planLoading ? 'Planning…' : 'Generate document plan'}
          </button>
          <button
            type="button"
            className="rewrite-button rewrite-button-secondary"
            onClick={onImportResolvedPlan}
            disabled={resolvedCount === 0}
          >
            Import {resolvedCount > 0 ? `(${resolvedCount})` : ''} to accepted
          </button>
        </div>
        {planError ? (
          <p className="rewrite-error" role="alert">
            {planError}
          </p>
        ) : null}
        {planEdits && planEdits.length > 0 ? (
          <ul className="plan-edits-list">
            {planEdits.map((e, i) => (
              <li key={`${e.page}-${e.find.slice(0, 12)}-${i}`} className="plan-edit-item">
                <span className="plan-edit-meta">
                  p.{e.page}
                  {e.error ? (
                    <span className="plan-edit-error"> — {e.error}</span>
                  ) : null}
                </span>
                <pre className="selection-panel-body plan-edit-snippet">
                  {e.find} → {e.replace}
                </pre>
              </li>
            ))}
          </ul>
        ) : planEdits && planEdits.length === 0 ? (
          <p className="accepted-empty">No edits proposed (try a different instruction).</p>
        ) : null}

        <h3 className="accepted-section-title">
          Accepted patches
          {acceptedPatches.length > 0 ? ` (${acceptedPatches.length})` : ''}
        </h3>
        {acceptedPatches.length === 0 ? (
          <p className="accepted-empty">None yet. Accept a proposal to store it here.</p>
        ) : (
          <ul className="accepted-list">
            {acceptedPatches.map((p) => (
              <li key={p.id} className="accepted-item">
                <pre className="selection-panel-body accepted-snippet">
                  p.{p.page}: {p.replacementText}
                </pre>
              </li>
            ))}
          </ul>
        )}

        <h3 className="export-section-title">Export</h3>
        <p className="export-hint">
          Download a patched PDF. All accepted patches are applied in order. Typed text PDFs
          only.
        </p>
        <button
          type="button"
          className="export-button"
          onClick={onExport}
          disabled={!canExport || exportLoading}
        >
          {exportLoading ? 'Exporting…' : 'Download patched PDF'}
        </button>
        {exportError ? (
          <p className="export-error" role="alert">
            {exportError}
          </p>
        ) : null}
      </aside>
    )
  },
)
