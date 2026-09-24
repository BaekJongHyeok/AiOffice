const { app, BrowserWindow, ipcMain, clipboard, session } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROVIDERS = {
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/', domain: 'chatgpt.com' },
  claude: { name: 'Claude', url: 'https://claude.ai/', domain: 'claude.ai' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/', domain: 'gemini.google.com' },
};

const providerWindows = new Map();

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#10141f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

function getPartition(provider) {
  return `persist:ai-office-subscription-${provider}`;
}

function openProvider(provider, prompt = '') {
  const info = PROVIDERS[provider];
  if (!info) throw new Error('지원하지 않는 구독 서비스입니다.');
  if (prompt) clipboard.writeText(prompt);

  const existing = providerWindows.get(provider);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { ok: true, provider, promptCopied: Boolean(prompt) };
  }

  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    title: `AI OFFICE · ${info.name}`,
    backgroundColor: '#10141f',
    webPreferences: {
      partition: getPartition(provider),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  providerWindows.set(provider, win);
  win.on('closed', () => providerWindows.delete(provider));
  win.loadURL(info.url);
  return { ok: true, provider, promptCopied: Boolean(prompt) };
}

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-subscription', async (_event, { provider, prompt }) => {
  try {
    return openProvider(provider, prompt || '');
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle('copy-text', async (_event, text) => {
  clipboard.writeText(String(text || ''));
  return { ok: true };
});

ipcMain.handle('session-info', async (_event, provider) => {
  try {
    const info = PROVIDERS[provider];
    if (!info) throw new Error('지원하지 않는 서비스입니다.');
    const ses = session.fromPartition(getPartition(provider));
    const cookies = await ses.cookies.get({ domain: info.domain });
    return { ok: true, provider, hasSessionData: cookies.length > 0, cookieCount: cookies.length };
  } catch (error) {
    return { ok: false, provider, hasSessionData: false, error: error.message || String(error) };
  }
});

ipcMain.handle('clear-subscription-session', async (_event, provider) => {
  try {
    const win = providerWindows.get(provider);
    if (win && !win.isDestroyed()) win.close();
    const ses = session.fromPartition(getPartition(provider));
    await ses.clearStorageData();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});


ipcMain.handle('run-updater', async () => {
  try {
    const projectRoot = path.resolve(__dirname, '..');
    const updater = path.join(projectRoot, 'UPDATE_AND_RUN.bat');
    if (!fs.existsSync(updater)) {
      return { ok: false, error: 'UPDATE_AND_RUN.bat 파일을 찾을 수 없습니다.' };
    }
    if (!fs.existsSync(path.join(projectRoot, '.git'))) {
      return { ok: false, error: '아직 GitHub 연결이 완료되지 않았습니다. SETUP_GITHUB.bat을 먼저 한 번 실행하세요.' };
    }
    const child = spawn('cmd.exe', ['/c', 'start', '"AI OFFICE Updater"', updater], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    setTimeout(() => app.quit(), 500);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});
