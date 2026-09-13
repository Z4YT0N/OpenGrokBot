import { spawn } from 'node:child_process'

export interface CliRun {
  exitCode: number | null
  stdout: string
  stderr: string
  aborted: boolean
}

/**
 * Runs a CLI with the prompt on stdin (never as an argument: Arabic text passed as a
 * terminal argument on Windows gets mangled). Streams stdout lines to `onLine`.
 */
export function runCli(
  command: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; stdin: string; signal: AbortSignal; onLine?: (line: string) => void },
): Promise<CliRun> {
  return new Promise((resolve) => {
    // With shell:true on Windows the args are concatenated, so protect paths that contain spaces.
    const safeArgs = process.platform === 'win32' ? args.map((a) => (/\s/.test(a) && !a.startsWith('"') ? `"${a}"` : a)) : args
    const child = spawn(command, safeArgs, {
      cwd: opts.cwd,
      env: opts.env,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let buffer = ''
    let aborted = false
    const onAbort = (): void => {
      aborted = true
      child.kill()
    }
    if (opts.signal.aborted) onAbort()
    else opts.signal.addEventListener('abort', onAbort, { once: true })

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      if (!opts.onLine) return
      buffer += chunk
      let i = buffer.indexOf('\n')
      while (i !== -1) {
        opts.onLine(buffer.slice(0, i).replace(/\r$/, ''))
        buffer = buffer.slice(i + 1)
        i = buffer.indexOf('\n')
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (err) => {
      stderr += `\n${err.message}`
    })
    child.on('close', (code) => {
      opts.signal.removeEventListener('abort', onAbort)
      if (buffer.length > 0 && opts.onLine) opts.onLine(buffer)
      resolve({ exitCode: code, stdout, stderr, aborted })
    })
    child.stdin.on('error', () => {
      // the CLI may exit before reading stdin (e.g. bad flags); the close handler reports it
    })
    child.stdin.end(opts.stdin, 'utf8')
  })
}

/** `<cmd> --version`, used for the provider status page. */
export async function cliVersion(command: string, args = ['--version']): Promise<string | null> {
  const run = await runCli(command, args, { cwd: process.cwd(), env: process.env, stdin: '', signal: new AbortController().signal })
  if (run.exitCode !== 0) return null
  return run.stdout.trim().split('\n')[0] ?? null
}
