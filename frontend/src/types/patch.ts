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
