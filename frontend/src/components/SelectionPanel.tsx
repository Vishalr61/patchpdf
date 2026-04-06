import type { AcceptedPatch, RewriteProposal } from '../types/patch'

type SelectionPanelProps = {
  selectedText: string
  instruction: string
  onInstructionChange: (value: string) => void
  onRewrite: () => void
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
}

export function SelectionPanel({
  selectedText,
  instruction,
  onInstructionChange,
  onRewrite,
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
}: SelectionPanelProps) {
  const empty = selectedText.length === 0
  const canRewrite = !rewriteLoading && selectedText.trim().length > 0
  const canDecide = Boolean(proposal) && !rewriteLoading

  return (
    <aside className="selection-panel" aria-label="Selection and rewrite">
      <h2 className="selection-panel-title">Selection</h2>
      <p className="selection-panel-hint">
        Highlight text on the page, add an instruction, then run rewrite.
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

      <button
        type="button"
        className="rewrite-button"
        onClick={onRewrite}
        disabled={!canRewrite}
      >
        {rewriteLoading ? 'Rewriting…' : 'Rewrite'}
      </button>

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
                {p.replacementText}
              </pre>
            </li>
          ))}
        </ul>
      )}

      <h3 className="export-section-title">Export</h3>
      <p className="export-hint">
        Download a patched PDF (page 1 only). Uses the <strong>latest</strong>{' '}
        accepted patch. Typed text PDFs only.
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
}
