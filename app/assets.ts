// Static reading pages need no client runtime. Interactive pages preload only their own entries.
export type ClientFeatures = 'workspace' | 'preview' | 'example'
export const entryHref = '/client/entry.js'
export const entryPreloads: Record<ClientFeatures, string[]> = {
  workspace: ['/client/workspace.js', '/client/route-map.js'],
  preview: ['/client/route-map.js', '/client/upload-form.js'],
  example: ['/client/example-flow.js', '/client/route-map.js'],
}
