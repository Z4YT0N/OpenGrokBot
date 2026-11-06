import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseBedrockReply } from './bedrock.js'

test('Bedrock Converse parser accepts text and tool use', () => {
  const output = JSON.stringify({ output: { message: { role: 'assistant', content: [
    { text: 'Reviewing' }, { toolUse: { toolUseId: 't1', name: 'read_file', input: { path: 'a.txt' } } },
  ] } }, stopReason: 'tool_use', usage: { inputTokens: 20, outputTokens: 10 } })
  const parsed = parseBedrockReply(output)
  assert.equal(parsed.output?.message?.content[0]?.text, 'Reviewing')
  assert.equal(parsed.output?.message?.content[1]?.toolUse?.name, 'read_file')
  assert.equal(parsed.usage?.inputTokens, 20)
})
test('Bedrock Converse parser rejects incomplete output', () => {
  assert.throws(() => parseBedrockReply('{}'), /invalid Converse response/)
})
