const { app, BrowserWindow, screen, globalShortcut } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

let win;
let cursorTimer;
let assetServer;

function startAssetServer() {
  const projectRoot = path.resolve(__dirname);
  const modelRoot = path.resolve(projectRoot, 'assets/s14');
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.gltf': 'model/gltf+json',
    '.fbx': 'application/octet-stream',
    '.bin': 'application/octet-stream',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  };

  assetServer = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }

    let file;
    if (pathname === '/' || pathname === '/index.html') {
      file = path.join(projectRoot, 'index.html');
    } else if (pathname === '/renderer.bundle.js') {
      file = path.join(projectRoot, 'renderer.bundle.js');
    } else if (pathname.startsWith('/assets/s14/')) {
      file = path.resolve(projectRoot, `.${pathname}`);
      if (!file.startsWith(`${modelRoot}${path.sep}`)) {
        res.writeHead(403).end();
        return;
      }
    } else {
      res.writeHead(404).end();
      return;
    }

    fs.stat(file, (error, stats) => {
      if (error || !stats.isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stats.size,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(file).pipe(res);
    });
  });

  return new Promise((resolve, reject) => {
    assetServer.once('error', reject);
    assetServer.listen(0, '127.0.0.1', () => {
      const { port } = assetServer.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function createWindow(appUrl) {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  win = new BrowserWindow({
    x, y, width, height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, 'floating');
  win.loadURL(`${appUrl}/index.html`);

  // The window ignores mouse events, so sample the system cursor directly.
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const point = screen.getCursorScreenPoint();
    win.webContents.send('cursor-position', {
      x: point.x - x,
      y: point.y - y
    });
  }, 32);
  win.on('closed', () => {
    clearInterval(cursorTimer);
    cursorTimer = null;
    win = null;
  });
}

app.whenReady().then(() => {
  return startAssetServer().then((appUrl) => createWindow(appUrl));
}).then(() => {
  globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());
}).catch((error) => {
  console.error('Could not start the desktop pet:', error);
  app.quit();
});

app.on('will-quit', () => {
  clearInterval(cursorTimer);
  if (assetServer) assetServer.close();
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => {});
