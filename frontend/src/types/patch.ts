export type BBox = [number, number, number, number]

export type RewriteProposal = {
  originalText: string
  instruction: string
  replacementText: string
  page: number
  bbox: BBox
}

export type AcceptedPatch = RewriteProposal & {
  id: string
}

export type PlanResolvedEdit = {
  page: number
  find: string
  replace: string
  bbox: number[] | null
  error: string | null
}

export type ExportMode = 'reflow' | 'overlay'
