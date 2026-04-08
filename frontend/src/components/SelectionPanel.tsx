import { forwardRef } from 'react'
import type {
  AcceptedPatch,
  ExportMode,
  PlanResolvedEdit,
  RewriteProposal,
} from '../types/patch'

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
  onClearSelection: () => void
  acceptedPatches: AcceptedPatch[]
  onRemoveAcceptedPatch: (id: string) => void
  onMoveAcceptedPatch: (id: string, dir: 'up' | 'down') => void
  canExport: boolean
  exportLoading: boolean
  exportError: string | null
  onExport: () => void
  exportMode: ExportMode
  onExportModeChange: (mode: ExportMode) => void
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
      onClearSelection,
      acceptedPatches,
      onRemoveAcceptedPatch,
      onMoveAcceptedPatch,
      canExport,
      exportLoading,
      exportError,
      onExport,
      exportMode,
      onExportModeChange,
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
      <aside ref={ref} className="patch-studio" aria-label="Patch Studio">
        <div className="studio-header">
          <h2 className="studio-title">PATCH</h2>
          <div className="studio-mode">
            <span className="studio-mode-label">Export</span>
            <div className="segmented">
              <button
                type="button"
                className={`segmented-btn${exportMode === 'reflow' ? ' is-active' : ''}`}
                onClick={() => onExportModeChange('reflow')}
              >
                Reflow
              </button>
              <button
                type="button"
                className={`segmented-btn${exportMode === 'overlay' ? ' is-active' : ''}`}
                onClick={() => onExportModeChange('overlay')}
                title="Overlay is closer to original layout but more finicky"
              >
                Overlay
              </button>
            </div>
          </div>
        </div>

        <section className="studio-section">
          <div className="section-head">
            <h3 className="section-title">
              <span className="step">1</span> Selected text
            </h3>
            <span className={`pill${empty ? '' : ' is-on'}`}>
              {empty ? 'No selection' : `p.${(proposal?.page ?? '') || ''}`.trim()}
            </span>
          </div>
          <pre className={`studio-pre${empty ? ' is-empty' : ''}`}>
            {empty ? 'Highlight text on the PDF to edit.' : selectedText}
          </pre>
          <div className="studio-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClearSelection}
              disabled={empty}
            >
              Clear selection
            </button>
          </div>
        </section>

        <section className="studio-section">
          <div className="section-head">
            <h3 className="section-title">
              <span className="step">2</span> Instruction
            </h3>
            <span className="section-subtitle">Type first or select first—either works.</span>
          </div>
          <textarea
            id="rewrite-instruction"
            className="studio-textarea"
            rows={3}
            placeholder="e.g. simplify this"
            value={instruction}
            onChange={(e) => onInstructionChange(e.target.value)}
            disabled={rewriteLoading}
          />

          <div className="studio-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onRewrite}
              disabled={!canRewrite}
            >
              {rewriteLoading ? 'Running…' : 'Run rewrite'}
            </button>
            {canRegenerate ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onRegenerateProposal}
                disabled={rewriteLoading}
              >
                Regenerate
              </button>
            ) : null}
          </div>

          {rewriteError ? (
            <p className="inline-error" role="alert">
              {rewriteError}
            </p>
          ) : null}
        </section>

        <section className="studio-section">
          <div className="section-head">
            <h3 className="section-title">
              <span className="step">3</span> Output
            </h3>
            <span className="section-subtitle">AI output preview</span>
          </div>
          <pre className={`studio-pre${!proposal ? ' is-empty' : ''}`}>
            {!proposal
              ? rewriteLoading
                ? '…'
                : 'Run rewrite to see a proposal.'
              : proposal.replacementText}
          </pre>

          {canDecide ? (
            <div className="accept-pair">
              <button type="button" className="mini-btn mini-accept" onClick={onAcceptProposal}>
                Accept
              </button>
              <button type="button" className="mini-btn mini-discard" onClick={onRejectProposal}>
                Discard
              </button>
            </div>
          ) : null}
        </section>

        <section className="studio-section">
          <div className="section-head">
            <h3 className="section-title">Document plan</h3>
            <span className="section-subtitle">Optional: propose edits across all pages</span>
          </div>
          <div className="studio-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onGenerateDocumentPlan}
              disabled={!hasPdfFile || planLoading}
            >
              {planLoading ? 'Planning…' : 'Generate plan'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onImportResolvedPlan}
              disabled={resolvedCount === 0}
            >
              Import {resolvedCount > 0 ? `(${resolvedCount})` : ''} to accepted
            </button>
          </div>
          {planError ? (
            <p className="inline-error" role="alert">
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
                <pre className="studio-pre plan-edit-snippet">{e.find} → {e.replace}</pre>
              </li>
            ))}
          </ul>
        ) : planEdits && planEdits.length === 0 ? (
          <p className="muted-line">No edits proposed (try a different instruction).</p>
        ) : null}
        </section>

        <section className="studio-section">
          <div className="section-head">
            <h3 className="section-title">
              Accepted changes
            </h3>
            <span className="count-badge">{acceptedPatches.length}</span>
          </div>
          {acceptedPatches.length === 0 ? (
            <p className="muted-line">None yet. Accept a proposal to store it here.</p>
          ) : (
            <ul className="accepted-list">
              {acceptedPatches.map((p, idx) => (
                <li key={p.id} className="accepted-item">
                  <div className="accepted-row">
                    <span className="accepted-meta">p.{p.page}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onMoveAcceptedPatch(p.id, 'up')}
                      disabled={idx === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onMoveAcceptedPatch(p.id, 'down')}
                      disabled={idx === acceptedPatches.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      onClick={() => onRemoveAcceptedPatch(p.id)}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                  <pre className="studio-pre accepted-snippet">{p.replacementText}</pre>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="studio-section">
          <div className="section-head">
            <h3 className="section-title">Export</h3>
            <span className="section-subtitle">
              {exportMode === 'reflow'
                ? 'Generates a new PDF (stable for long edits)'
                : 'Overlays text (closer to original layout)'}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onExport}
            disabled={!canExport || exportLoading}
          >
            {exportLoading ? 'Exporting…' : 'Download PDF'}
          </button>
          {exportError ? (
            <p className="inline-error" role="alert">
              {exportError}
            </p>
          ) : null}
        </section>
      </aside>
    )
  },
)
