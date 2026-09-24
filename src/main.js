const { app, BrowserWindow, ipcMain, clipboard, session } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROVIDERS = {
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/', domain: 'chatgpt.com' },
  claude: { name: 'Claude', url: 'https://claude.ai/', domain: 'claude.ai' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/', domain: 'gemini.google.com' },
};

const providerWindows = new Map();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const execFileAsync = (file, args, options = {}) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide:true, maxBuffer: 10 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
    if (error) { error.stdout = stdout; error.stderr = stderr; reject(error); return; }
    resolve({ stdout, stderr });
  });
});

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#10141f',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

function getPartition(provider) { return `persist:ai-office-subscription-${provider}`; }

async function ensureProviderWindow(provider, prompt = '', options = {}) {
  const { show = true } = options;
  const info = PROVIDERS[provider];
  if (!info) throw new Error('지원하지 않는 구독 서비스입니다.');
  if (prompt) clipboard.writeText(prompt);

  let win = providerWindows.get(provider);
  if (win && !win.isDestroyed()) {
    if (show) { win.show(); win.focus(); }
    else win.hide();
    return win;
  }

  win = new BrowserWindow({
    width: 1180, height: 820, show,
    title: `AI OFFICE · ${info.name}`,
    backgroundColor: '#10141f',
    webPreferences: { partition: getPartition(provider), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  providerWindows.set(provider, win);
  win.on('closed', () => providerWindows.delete(provider));
  await win.loadURL(info.url);
  return win;
}

function openProvider(provider, prompt = '') {
  return ensureProviderWindow(provider, prompt, { show:true }).then(() => ({ ok: true, provider, promptCopied: Boolean(prompt) }));
}

async function hasProviderSession(provider) {
  const info = PROVIDERS[provider];
  if (!info) return false;
  const ses = session.fromPartition(getPartition(provider));
  const cookies = await ses.cookies.get({ domain: info.domain });
  return cookies.length > 0;
}

function automationScript(prompt) {
  const safePrompt = JSON.stringify(prompt);
  return `(() => {
    const prompt = ${safePrompt};
    const visible = (el) => !!(el && el.getClientRects().length && !el.disabled);
    const input =
      document.querySelector('#prompt-textarea[contenteditable="true"]') ||
      document.querySelector('#prompt-textarea[contenteditable="plaintext-only"]') ||
      document.querySelector('#prompt-textarea') ||
      document.querySelector('textarea[placeholder*="Message"]') ||
      document.querySelector('textarea[placeholder*="메시지"]') ||
      document.querySelector('textarea') ||
      [...document.querySelectorAll('[contenteditable="true"],[contenteditable="plaintext-only"]')].filter(visible).pop();

    if (!input || !visible(input)) return { ok:false, stage:'input', retryable:true, error:'입력창을 찾지 못했습니다.' };

    input.focus();

    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      const proto = Object.getPrototypeOf(input);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(input, prompt); else input.value = prompt;
      input.dispatchEvent(new Event('input', { bubbles:true }));
      input.dispatchEvent(new Event('change', { bubbles:true }));
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('delete', false, null);
      document.execCommand('insertText', false, prompt);
      input.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:prompt }));
    }

    const send =
      document.querySelector('#composer-submit-button') ||
      document.querySelector('button[data-testid="send-button"]') ||
      [...document.querySelectorAll('button')].filter(visible).find((b) => {
        const a = ((b.getAttribute('aria-label')||'') + ' ' + (b.getAttribute('data-testid')||'') + ' ' + (b.title||'')).toLowerCase();
        return /send|submit|보내|전송/.test(a);
      });

    if (send && visible(send) && send.getAttribute('aria-disabled') !== 'true') {
      send.click();
      return { ok:true, stage:'submitted', method:'button' };
    }

    return { ok:false, stage:'send', retryable:true, error:'전송 버튼이 아직 준비되지 않았습니다.' };
  })()`;
}

function extractionScript(provider) {
  const safeProvider = JSON.stringify(provider);
  return `(() => {
    const provider = ${safeProvider};
    let nodes = [];

    if (provider === 'chatgpt') {
      nodes = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    } else if (provider === 'claude') {
      nodes = [
        ...document.querySelectorAll('[data-is-streaming="false"]'),
        ...document.querySelectorAll('[class*="font-claude-message"]'),
        ...document.querySelectorAll('[data-testid*="assistant"]')
      ];
    } else if (provider === 'gemini') {
      nodes = [
        ...document.querySelectorAll('message-content'),
        ...document.querySelectorAll('.model-response-text'),
        ...document.querySelectorAll('[data-test-id*="model-response"]')
      ];
    }

    nodes = nodes.filter(el => {
      const text = (el.innerText || '').trim();
      return text.length >= 60;
    });

    const el = nodes[nodes.length - 1];
    return el ? el.innerText.trim() : '';
  })()`;
}

function isUsableModelResponse(text, prompt) {
  const value = String(text || '').trim();
  const source = String(prompt || '').trim();

  if (value.length < 120) return false;
  if (source && (value === source || source.startsWith(value) || value.startsWith(source.slice(0, Math.min(180, source.length))))) return false;

  const promptLeakMarkers = ['[CEO 목표]', '[프로젝트]', '당신은 AI 회사', '보고 형식:'];
  const leaked = promptLeakMarkers.filter(marker => value.includes(marker)).length;
  if (leaked >= 3 && source && source.includes('[CEO 목표]')) return false;

  const incompletePatterns = [
    /^웹사이트\s*\d+개?\s*검색/i,
    /^검색\s*중/i,
    /^thinking/i,
    /^생각\s*중/i
  ];
  if (incompletePatterns.some(re => re.test(value)) && value.length < 400) return false;

  return true;
}

async function automateSubscription(provider, prompt) {
  const hasSession = await hasProviderSession(provider);
  if (!hasSession) {
    await ensureProviderWindow(provider, '', { show:true });
    return { ok:false, stage:'login', error:'로그인이 필요합니다. 열린 구독 창에서 로그인한 뒤 다시 자동 실행하세요.' };
  }

  const win = await ensureProviderWindow(provider, prompt, { show:false });
  await sleep(800);

  let submit = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      submit = await win.webContents.executeJavaScript(automationScript(prompt), true);
    } catch (e) {
      submit = { ok:false, stage:'inject', retryable:true, error:e.message };
    }
    if (submit?.ok) break;
    if (!submit?.retryable) return submit || { ok:false, error:'자동 입력에 실패했습니다.' };
    await sleep(500);
  }
  if (!submit?.ok) {
    return {
      ...(submit || {}),
      ok:false,
      error:submit?.error || '입력창 또는 전송 버튼을 준비하지 못했습니다.'
    };
  }

  let last = '';
  let stable = 0;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    if (win.isDestroyed()) return { ok:false, stage:'closed', error:'AI 창이 닫혔습니다.' };
    let text = '';
    try { text = await win.webContents.executeJavaScript(extractionScript(provider), true); } catch {}
    if (text && isUsableModelResponse(text, prompt)) {
      if (text === last) stable += 1; else { last = text; stable = 0; }
      if (stable >= 2) return { ok:true, result:text, provider, automated:true };
    }
  }
  return { ok:false, stage:'timeout', error:'완성된 AI 답변을 확인하지 못했습니다. 프롬프트/중간 로그는 보고서로 저장하지 않았습니다. 다시 자동 실행하거나 수동 결과 입력을 사용하세요.', partial:isUsableModelResponse(last, prompt) ? last : '' };
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
  const projectRoot = path.resolve(__dirname, '..');
  const logPath = path.join(projectRoot, 'ai-office-update.log');
  const writeLog = (text) => {
    try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${text}\n`); } catch {}
  };

  try {
    if (!fs.existsSync(path.join(projectRoot, '.git'))) {
      return { ok:false, error:'GitHub 연결이 완료되지 않았습니다.' };
    }

    writeLog('Update started');

    const status = await execFileAsync('git.exe', ['status', '--porcelain', '--untracked-files=no'], { cwd:projectRoot });
    if (status.stdout.trim()) {
      writeLog('Stopped: local changes detected');
      return {
        ok:false,
        error:'로컬 소스에 수정사항이 있어 자동 업데이트를 중단했습니다. git status를 확인해 주세요.'
      };
    }

    writeLog('Running git pull');
    const pull = await execFileAsync('git.exe', ['pull', '--ff-only', 'origin', 'main'], { cwd:projectRoot });
    writeLog((pull.stdout || pull.stderr || 'git pull complete').trim());

    writeLog('Running npm install');
    let install;
    if (process.platform === 'win32') {
      install = await execFileAsync('cmd.exe', ['/d', '/s', '/c', 'npm.cmd install --no-fund --no-audit'], { cwd:projectRoot });
    } else {
      install = await execFileAsync('npm', ['install', '--no-fund', '--no-audit'], { cwd:projectRoot });
    }
    writeLog((install.stdout || install.stderr || 'npm install complete').trim());

    writeLog('Relaunching app');
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 800);

    return { ok:true, message:'업데이트가 완료되었습니다. AI OFFICE를 재시작합니다.' };
  } catch (error) {
    const detail = [error.message, error.stderr, error.stdout].filter(Boolean).join('\n').trim();
    writeLog(`ERROR: ${detail}`);
    return {
      ok:false,
      error:`업데이트 중 오류가 발생했습니다.\n\n${detail || '자세한 내용은 ai-office-update.log를 확인하세요.'}`
    };
  }
});
