type SelectionPanelProps = {
  selectedText: string
  instruction: string
  onInstructionChange: (value: string) => void
  onRewrite: () => void
  rewriteLoading: boolean
  rewriteError: string | null
  replacementText: string | null
}

export function SelectionPanel({
  selectedText,
  instruction,
  onInstructionChange,
  onRewrite,
  rewriteLoading,
  rewriteError,
  replacementText,
}: SelectionPanelProps) {
  const empty = selectedText.length === 0
  const canRewrite = !rewriteLoading && selectedText.trim().length > 0

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
        className={`selection-panel-body rewrite-output${!replacementText ? ' is-empty' : ''}`}
      >
        {!replacementText
          ? rewriteLoading
            ? '…'
            : 'Run rewrite to see a proposal.'
          : replacementText}
      </pre>
    </aside>
  )
}
