(() => {
  const queues = { chatgpt: Promise.resolve(), claude: Promise.resolve(), gemini: Promise.resolve() };
  const queuedIds = new Set();

  function ensureControls() {
    const commandRow = document.querySelector('.command-row');
    if (commandRow && !document.querySelector('#autoRunToggle')) {
      const label = document.createElement('label');
      label.className = 'auto-toggle';
      label.innerHTML = '<input id="autoRunToggle" type="checkbox" checked><span>⚡ 배정 즉시 자동 실행 (실험 기능)</span>';
      commandRow.parentElement.insertBefore(label, commandRow);
    }

    document.querySelectorAll('.open-ai, .board-open').forEach((button) => {
      const parent = button.parentElement;
      if (!parent || parent.querySelector('.subscription-auto-btn')) return;
      const auto = document.createElement('button');
      auto.className = 'text-btn subscription-auto-btn';
      auto.textContent = '⚡ 자동 실행';
      auto.dataset.id = button.dataset.id;
      auto.onclick = () => enqueue(auto.dataset.id);
      parent.insertBefore(auto, button);
    });

    if (!document.querySelector('#subscriptionAutomationStyle')) {
      const style = document.createElement('style');
      style.id = 'subscriptionAutomationStyle';
      style.textContent = '.auto-toggle{display:flex;align-items:center;gap:10px;margin:12px 0;padding:10px 12px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.03);font-size:13px}.auto-toggle input{width:16px;height:16px}.subscription-auto-btn{color:#ffd66b!important}';
      document.head.appendChild(style);
    }
  }

  async function execute(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task || task.status === 'done' || task.provider === 'demo') return;

    task.status = 'working';
    task.automationStartedAt = Date.now();
    persist();
    renderAll();
    ensureControls();

    const result = await window.aiOffice.automateSubscription(task.provider, task.prompt || '');
    if (result?.ok && result.result) {
      task.status = 'done';
      task.finishedAt = Date.now();
      task.automated = true;
      state.reports.unshift({
        id: uid(),
        employeeId: task.employeeId,
        employeeName: task.employeeName,
        department: task.department,
        provider: task.provider,
        task: task.task,
        result: result.result,
        createdAt: Date.now(),
        automated: true,
      });
    } else {
      task.status = 'opened';
      task.automationError = result?.error || '자동 실행에 실패했습니다.';
      task.partialResult = result?.partial || '';
    }
    persist();
    renderAll();
    ensureControls();
  }

  function enqueue(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task || task.status === 'done' || task.provider === 'demo' || queuedIds.has(id)) return;
    queuedIds.add(id);
    const provider = task.provider;
    const run = async () => {
      try { await execute(id); } finally { queuedIds.delete(id); }
    };
    queues[provider] = (queues[provider] || Promise.resolve()).then(run, run);
  }

  document.querySelector('#runTaskBtn')?.addEventListener('click', () => {
    setTimeout(() => {
      ensureControls();
      if (!document.querySelector('#autoRunToggle')?.checked) return;
      state.tasks
        .filter(t => t.status === 'queued' && t.provider !== 'demo')
        .forEach(t => enqueue(t.id));
    }, 80);
  });

  const observer = new MutationObserver(() => ensureControls());
  observer.observe(document.body, { childList: true, subtree: true });
  ensureControls();

  const version = document.querySelector('.sidebar-foot small');
  if (version) version.textContent = 'v0.3.0 · Subscription Automation';
})();
