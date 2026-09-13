// Electron shell: starts the office server as a child Node process and opens it in a window.
const { app, BrowserWindow, shell } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const http = require('node:http')

const PORT = Number(process.env.PORT ?? 4310)
const URL = `http://127.0.0.1:${PORT}/`
const root = path.join(__dirname, '..')
let server = null

function startServer() {
  const env = { ...process.env, PORT: String(PORT), ELECTRON_RUN_AS_NODE: '1' }
  server = spawn(process.execPath, [path.join(root, 'dist', 'server', 'index.js')], { cwd: root, env, stdio: 'inherit' })
  server.on('exit', (code) => {
    server = null
    if (code !== 0 && !app.isQuitting) console.error(`[desktop] server exited with code ${code}`)
  })
}

function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    const tryOnce = (left) => {
      const req = http.get(`${URL}api/state`, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (left <= 0) reject(new Error('server did not start'))
        else setTimeout(() => tryOnce(left - 1), 250)
      })
    }
    tryOnce(retries)
  })
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111111',
    title: 'OpenGrokBot',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#141414', symbolColor: '#8f8f8f', height: 40 },
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  await waitForServer()
  await win.loadURL(URL)
}

app.whenReady().then(async () => {
  startServer()
  try {
    await createWindow()
  } catch (err) {
    console.error(err)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  app.isQuitting = true
  if (server) server.kill()
  app.quit()
})

app.on('before-quit', () => {
  app.isQuitting = true
  if (server) server.kill()
})
