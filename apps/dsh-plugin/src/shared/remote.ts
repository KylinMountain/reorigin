/** Wire contract shared by both halves: endpoint `reorigin/<method>` with named arguments. */
export const REMOTE_NAMESPACE = 'reorigin'
export const REMOTE_METHODS = ['dashboard', 'execute', 'agentStatus', 'syncNow'] as const
export type RemoteMethod = (typeof REMOTE_METHODS)[number]

export const PANEL_ID = 'reorigin'
