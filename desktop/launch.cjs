// `npm run desktop`: launches Electron with a clean environment.
// Editors like VS Code export ELECTRON_RUN_AS_NODE=1 to their terminals, which
// would make Electron start as plain Node and crash on `app.whenReady`.
const { spawn } = require('node:child_process')
const path = require('node:path')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const electron = require('electron')
const child = spawn(electron, [path.join(__dirname, '..')], { env, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
