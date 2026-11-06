import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { insideRoots, safeFetchUrl } from './security.js'

test('file root containment rejects traversal and symlink escapes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ogb-security-'))
  try {
    const permitted = path.join(root, 'work')
    const elsewhere = path.join(root, 'other')
    mkdirSync(permitted)
    mkdirSync(elsewhere)
    writeFileSync(path.join(permitted, 'safe.txt'), 'ok')
    writeFileSync(path.join(elsewhere, 'secret.txt'), 'secret')
    symlinkSync(elsewhere, path.join(permitted, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.equal(insideRoots(path.join(permitted, 'safe.txt'), [permitted]), true)
    assert.equal(insideRoots(path.join(permitted, 'link', 'secret.txt'), [permitted]), false)
    assert.equal(insideRoots(path.join(permitted, 'link', 'new.txt'), [permitted], true), false)
    assert.equal(insideRoots(path.join(permitted, 'new.txt'), [permitted], true), true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('untrusted web URLs reject IP literals and local hostnames', () => {
  for (const target of ['http://127.0.0.1/', 'http://[::1]/', 'http://localhost/', 'http://metadata.google.internal/']) {
    assert.throws(() => safeFetchUrl(target))
  }
  assert.equal(safeFetchUrl('https://example.org/page').hostname, 'example.org')
})
