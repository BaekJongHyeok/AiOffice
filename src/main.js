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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#10141f',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

function getPartition(provider) { return `persist:ai-office-subscription-${provider}`; }

async function ensureProviderWindow(provider, prompt = '') {
  const info = PROVIDERS[provider];
  if (!info) throw new Error('지원하지 않는 구독 서비스입니다.');
  if (prompt) clipboard.writeText(prompt);

  let win = providerWindows.get(provider);
  if (win && !win.isDestroyed()) {
    win.show(); win.focus();
    return win;
  }

  win = new BrowserWindow({
    width: 1180, height: 820, title: `AI OFFICE · ${info.name}`,
    backgroundColor: '#10141f',
    webPreferences: { partition: getPartition(provider), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  providerWindows.set(provider, win);
  win.on('closed', () => providerWindows.delete(provider));
  await win.loadURL(info.url);
  return win;
}

function openProvider(provider, prompt = '') {
  return ensureProviderWindow(provider, prompt).then(() => ({ ok: true, provider, promptCopied: Boolean(prompt) }));
}

function automationScript(prompt) {
  const safePrompt = JSON.stringify(prompt);
  return `(() => {
    const prompt = ${safePrompt};
    const visible = (el) => !!(el && el.getClientRects().length && !el.disabled);
    const candidates = [
      document.querySelector('#prompt-textarea'),
      document.querySelector('textarea[placeholder*="Message"]'),
      document.querySelector('textarea[placeholder*="메시지"]'),
      document.querySelector('textarea'),
      ...document.querySelectorAll('[contenteditable="true"]')
    ].filter(visible);
    const input = candidates[candidates.length - 1];
    if (!input) return { ok:false, stage:'input', error:'입력창을 찾지 못했습니다.' };
    input.focus();
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
      if (setter) setter.call(input, prompt); else input.value = prompt;
      input.dispatchEvent(new Event('input', { bubbles:true }));
      input.dispatchEvent(new Event('change', { bubbles:true }));
    } else {
      input.textContent = prompt;
      input.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:prompt }));
    }
    const buttons = [...document.querySelectorAll('button')].filter(visible);
    const send = buttons.find(b => {
      const a = ((b.getAttribute('aria-label')||'') + ' ' + (b.getAttribute('data-testid')||'') + ' ' + (b.title||'')).toLowerCase();
      return /send|submit|보내|전송/.test(a);
    });
    if (send) { send.click(); return { ok:true, stage:'submitted', method:'button' }; }
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
    input.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
    return { ok:true, stage:'submitted', method:'enter' };
  })()`;
}

function extractionScript() {
  return `(() => {
    const selectors = [
      '[data-message-author-role="assistant"]',
      '[data-testid*="assistant"]',
      '[class*="assistant"]',
      'main article',
      'main .markdown',
      'main [class*="response"]'
    ];
    let nodes = [];
    for (const s of selectors) {
      const found = [...document.querySelectorAll(s)].filter(el => el.innerText && el.innerText.trim().length > 20);
      if (found.length) nodes = found;
    }
    const el = nodes[nodes.length - 1];
    return el ? el.innerText.trim() : '';
  })()`;
}

async function automateSubscription(provider, prompt) {
  const win = await ensureProviderWindow(provider, prompt);
  await sleep(1200);
  let submit;
  try { submit = await win.webContents.executeJavaScript(automationScript(prompt), true); }
  catch (e) { return { ok:false, stage:'inject', error:e.message }; }
  if (!submit?.ok) return submit || { ok:false, error:'자동 입력에 실패했습니다.' };

  let last = '';
  let stable = 0;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    if (win.isDestroyed()) return { ok:false, stage:'closed', error:'AI 창이 닫혔습니다.' };
    let text = '';
    try { text = await win.webContents.executeJavaScript(extractionScript(), true); } catch {}
    if (text && text.length > 20) {
      if (text === last) stable += 1; else { last = text; stable = 0; }
      if (stable >= 2) return { ok:true, result:text, provider, automated:true };
    }
  }
  return { ok:false, stage:'timeout', error:'답변 자동 회수 시간이 초과되었습니다. 수동 결과 입력을 사용하세요.', partial:last || '' };
}

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('open-subscription', async (_event, { provider, prompt }) => {
  try { return await openProvider(provider, prompt || ''); } catch (error) { return { ok:false, error:error.message || String(error) }; }
});
ipcMain.handle('automate-subscription', async (_event, { provider, prompt }) => {
  try { return await automateSubscription(provider, prompt || ''); } catch (error) { return { ok:false, error:error.message || String(error) }; }
});
ipcMain.handle('copy-text', async (_event, text) => { clipboard.writeText(String(text || '')); return { ok:true }; });
ipcMain.handle('session-info', async (_event, provider) => {
  try {
    const info = PROVIDERS[provider]; if (!info) throw new Error('지원하지 않는 서비스입니다.');
    const ses = session.fromPartition(getPartition(provider));
    const cookies = await ses.cookies.get({ domain: info.domain });
    return { ok:true, provider, hasSessionData:cookies.length > 0, cookieCount:cookies.length };
  } catch (error) { return { ok:false, provider, hasSessionData:false, error:error.message || String(error) }; }
});
ipcMain.handle('clear-subscription-session', async (_event, provider) => {
  try {
    const win = providerWindows.get(provider); if (win && !win.isDestroyed()) win.close();
    const ses = session.fromPartition(getPartition(provider)); await ses.clearStorageData(); return { ok:true };
  } catch (error) { return { ok:false, error:error.message || String(error) }; }
});
ipcMain.handle('run-updater', async () => {
  try {
    const projectRoot = path.resolve(__dirname, '..'); const updater = path.join(projectRoot, 'UPDATE_AND_RUN.bat');
    if (!fs.existsSync(updater)) return { ok:false, error:'UPDATE_AND_RUN.bat 파일을 찾을 수 없습니다.' };
    if (!fs.existsSync(path.join(projectRoot, '.git'))) return { ok:false, error:'GitHub 연결이 완료되지 않았습니다.' };
    const child = spawn('cmd.exe', ['/c','start','"AI OFFICE Updater"',updater], { cwd:projectRoot, detached:true, stdio:'ignore', windowsHide:false });
    child.unref(); setTimeout(() => app.quit(), 500); return { ok:true };
  } catch (error) { return { ok:false, error:error.message || String(error) }; }
});
