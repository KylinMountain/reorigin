// Host half of the P0 spike. It only proves the Host loads and unloads the
// row; the domain core and any Remote/RPC surface come after P0.
export const name = 'reorigin'

export function apply(ctx) {
  console.log('[reorigin] host half loaded')
  ctx.effect(() => () => console.log('[reorigin] host half disposed'), 'reorigin: lifecycle log')
}
