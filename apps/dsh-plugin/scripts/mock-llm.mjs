// Scripted OpenAI-compatible chat endpoint for verifying DSH prompt assembly
// and tool dispatch without a real model. Logs every request body.
import { appendFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'

const LOG = process.argv[2]
const PORT = Number(process.argv[3] ?? 4599)
// 'propose' (default): one reorigin_propose_quest call. 'review': list reviewable quests, then annotate the first.
const SCENARIO = process.argv[4] ?? 'propose'
writeFileSync(LOG, '')

const PROPOSAL = {
  title: '为输入校验补一个回归测试',
  objective: '提交一个覆盖空输入场景的测试用例',
  rationale: '宿主刚提到修复了空输入的缺陷，但还没有对应测试',
  quest_type: 'side',
  evidence_kind: 'git_commit',
  evidence_count: 1,
  xp: 80,
}

function sse(res, chunks) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`)
  res.end('data: [DONE]\n\n')
}

function chunk(delta, finish = null) {
  return { id: 'mock', object: 'chat.completion.chunk', created: 0, model: 'mock-1', choices: [{ index: 0, delta, finish_reason: finish }] }
}

createServer((req, res) => {
  let body = ''
  req.on('data', data => { body += data })
  req.on('end', () => {
    if (req.method === 'GET' && req.url?.endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ data: [{ id: 'mock-1', object: 'model' }] }))
    }
    let parsed = {}
    try { parsed = JSON.parse(body) } catch {}
    appendFileSync(LOG, `${JSON.stringify({ url: req.url, body: parsed })}\n`)
    const messages = parsed.messages ?? []
    const toolResults = messages.filter(message => message.role === 'tool').map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content))
    const answered = toolResults.length > 0
    const toolResult = toolResults.join('\n')
    if (SCENARIO === 'review' && toolResults.length < 2) {
      const call = (name, args) => [
        chunk({ tool_calls: [{ index: 0, id: `call_mock_${name}_${toolResults.length}`, type: 'function', function: { name, arguments: '' } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] }),
        chunk({}, 'tool_calls'),
      ]
      if (toolResults.length === 0) return sse(res, [chunk({ role: 'assistant', content: '' }), ...call('reorigin_list_reviewable', {})])
      const questId = toolResult.match(/任务 (quest_[A-Za-z0-9_]+)/)?.[1] ?? 'missing'
      return sse(res, [chunk({ role: 'assistant', content: '' }), ...call('reorigin_add_review_note', { quest_id: questId, note: '证据是一个普通链接，建议补充已授权仓库中合并的 PR 链接以便佐证。' })])
    }
    if (!answered) {
      return sse(res, [
        chunk({ role: 'assistant', content: '【系统检测到成长机会】' }),
        chunk({ tool_calls: [{ index: 0, id: 'call_mock_1', type: 'function', function: { name: 'reorigin_propose_quest', arguments: '' } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(PROPOSAL) } }] }),
        chunk({}, 'tool_calls'),
      ])
    }
    return sse(res, [chunk({ role: 'assistant', content: `工具返回：${toolResult.slice(0, 200)}` }), chunk({}, 'stop')])
  })
}).listen(PORT, '127.0.0.1', () => console.log(`mock llm on ${PORT}`))
