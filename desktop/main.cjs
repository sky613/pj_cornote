const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron')
const { writeFile } = require('node:fs/promises')
const { extname, isAbsolute, join, relative, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')

const APP_ORIGIN = 'cornote-app://local'
const DEV_ORIGIN = 'http://localhost:5173'
const AUTH_CALLBACK = 'cornote://auth/callback'
let mainWindow
let pendingAuthUrl = process.argv.find((arg) => arg.startsWith(AUTH_CALLBACK))

protocol.registerSchemesAsPrivileged([
  { scheme: 'cornote-app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

function openExternal(url) {
  if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url)
}

function handleAuthUrl(url) {
  if (!url.startsWith(AUTH_CALLBACK)) return
  if (!mainWindow) {
    pendingAuthUrl = url
    return
  }
  const callback = new URL(url)
  const origin = app.isPackaged ? APP_ORIGIN : DEV_ORIGIN
  void mainWindow.loadURL(`${origin}/settings${callback.search}${callback.hash}`)
  mainWindow.show()
}

async function createWindow() {
  const origin = app.isPackaged ? APP_ORIGIN : DEV_ORIGIN
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    title: 'Cornote',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, 'preload.cjs'),
    },
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url)
    const internal = app.isPackaged
      ? target.protocol === 'cornote-app:' && target.hostname === 'local'
      : target.origin === origin
    if (internal) return
    event.preventDefault()
    openExternal(url)
  })
  mainWindow.on('closed', () => { mainWindow = undefined })
  await mainWindow.loadURL(origin)
  if (pendingAuthUrl) {
    const url = pendingAuthUrl
    pendingAuthUrl = undefined
    handleAuthUrl(url)
  }
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleAuthUrl(url)
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine.find((arg) => arg.startsWith(AUTH_CALLBACK))
    if (url) handleAuthUrl(url)
    else mainWindow?.show()
  })

  app.whenReady().then(async () => {
    app.setAsDefaultProtocolClient('cornote')

    ipcMain.handle('save-backup', async (event, filename, contents) => {
      if (event.sender !== mainWindow?.webContents ||
          !/^cornote-backup-\d{4}-\d{2}-\d{2}\.json$/.test(filename) ||
          typeof contents !== 'string') throw new Error('Invalid backup request')
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: filename,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (!canceled && filePath) await writeFile(filePath, contents, 'utf8')
    })

    const dist = resolve(app.getAppPath(), 'dist')
    protocol.handle('cornote-app', (request) => {
      const pathname = decodeURIComponent(new URL(request.url).pathname)
      const candidate = resolve(dist, `.${pathname}`)
      const localPath = relative(dist, candidate)
      if (localPath.startsWith('..') || isAbsolute(localPath)) return new Response('Forbidden', { status: 403 })
      const file = extname(candidate) ? candidate : join(dist, 'index.html')
      return net.fetch(pathToFileURL(file).toString())
    })

    await createWindow()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (!mainWindow) void createWindow()
  else mainWindow.show()
})
