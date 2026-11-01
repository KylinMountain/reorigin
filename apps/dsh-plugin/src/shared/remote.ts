/** Wire contract shared by both halves: endpoint `reorigin/<method>` with named arguments. */
export const REMOTE_NAMESPACE = 'reorigin'
export const REMOTE_METHODS = ['dashboard', 'execute', 'agentStatus', 'syncNow', 'exportData', 'importData', 'discoverSources'] as const
export type RemoteMethod = (typeof REMOTE_METHODS)[number]

export const PANEL_ID = 'reorigin'
/** Where the Host serves the System's static art; client-modules owns the bare package prefix. */
export const ASSET_ROUTE = '/plugins/dsh-plugin-reorigin/assets'
