(() => {
  const nav = document.querySelector('.sidebar nav');
  if (nav && !document.querySelector('.nav[data-view="projects"]')) {
    const btn = document.createElement('button');
    btn.className = 'nav';
    btn.dataset.view = 'projects';
    btn.innerHTML = '🗂️ 프로젝트';
    nav.insertBefore(btn, nav.children[1] || null);
    btn.onclick = () => showProjects();
  }

  const main = document.querySelector('main');
  if (main && !document.querySelector('#projectsView')) {
    const section = document.createElement('section');
    section.id = 'projectsView';
    section.className = 'view';
    section.innerHTML = `
      <div class="section-actions">
        <div><h2>프로젝트</h2><p>CEO의 큰 목표를 직원별 업무로 나누고 팀장이 최종 취합합니다.</p></div>
        <button id="newProjectBtn" class="btn primary">+ 새 프로젝트</button>
      </div>
      <div id="projectCards" class="project-cards"></div>
    `;
    main.appendChild(section);
  }

  function showProjects() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav').forEach(n => n.classList.remove('active'));
    document.querySelector('#projectsView')?.classList.add('active');
    document.querySelector('.nav[data-view="projects"]')?.classList.add('active');
    document.querySelector('#viewTitle').textContent = '프로젝트';
    document.querySelector('#viewSubtitle').textContent = '팀장이 직원 업무를 조율하고 최종 보고를 만듭니다.';
    renderProjects();
  }

  function ensureProjectModal() {
    if (document.querySelector('#projectModal')) return;
    const modal = document.createElement('div');
    modal.id = 'projectModal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-head"><h2>새 프로젝트</h2><button id="closeProjectModal" class="icon-btn">✕</button></div>
        <div class="form-grid">
          <label class="wide">프로젝트명<input id="projectName" placeholder="네일샵 신규 고객 확보" /></label>
          <label class="wide">CEO 목표<textarea id="projectObjective" placeholder="예: 3개월 안에 신규 고객 유입을 늘릴 마케팅 전략과 실행안을 만들어줘."></textarea></label>
          <label>팀장<select id="projectManager"></select></label>
          <label>자동 실행<select id="projectAuto"><option value="yes">예</option><option value="no">아니오</option></select></label>
          <label class="wide">참여 직원<div id="projectMembers" class="project-member-list"></div></label>
        </div>
        <div class="modal-actions"><button id="cancelProject" class="btn ghost">취소</button><button id="saveProject" class="btn primary">프로젝트 시작</button></div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.classList.add('hidden');
    modal.querySelector('#closeProjectModal').onclick = close;
    modal.querySelector('#cancelProject').onclick = close;
    modal.onclick = e => { if (e.target === modal) close(); };
    modal.querySelector('#saveProject').onclick = createProject;
  }

  function openProjectModal() {
    ensureProjectModal();
    const modal = document.querySelector('#projectModal');
    const manager = modal.querySelector('#projectManager');
    const members = modal.querySelector('#projectMembers');
    manager.innerHTML = state.employees.map(e => `<option value="${e.id}">${escapeHtml(e.name)} · ${escapeHtml(e.rank)} · ${escapeHtml(e.department)}</option>`).join('');
    members.innerHTML = state.employees.map(e => `
      <label class="project-member">
        <input type="checkbox" value="${e.id}" checked>
        <span>${e.avatar || '🧑‍💼'} ${escapeHtml(e.name)} · ${escapeHtml(e.role)}</span>
        <small>${providerLabel[e.provider] || e.provider}</small>
      </label>
    `).join('');
    modal.querySelector('#projectName').value = '';
    modal.querySelector('#projectObjective').value = '';
    modal.classList.remove('hidden');
  }

  function projectPrompt(employee, project) {
    return [
      `[프로젝트] ${project.name}`,
      `[CEO 목표] ${project.objective}`,
      '',
      `당신은 ${employee.department}의 ${employee.rank} ${employee.name}입니다.`,
      `담당 역할: ${employee.role}`,
      `업무 스타일: ${employee.traits || '정확하고 간결하게 수행'}`,
      '',
      'CEO 목표를 달성하기 위해 당신의 전문 역할에서 독립적으로 필요한 조사/분석/실행안을 수행하세요.',
      '다른 직원이 이어서 활용할 수 있도록 구체적인 결과와 근거를 남기세요.',
      '',
      '보고 형식:',
      '1. 담당 업무 요약',
      '2. 핵심 결과',
      '3. 실행안',
      '4. 리스크/확인사항',
      '5. 다음 직원에게 전달할 핵심 정보'
    ].join('\n');
  }

  function managerPrompt(manager, project, reports) {
    const evidence = reports.map((r, i) =>
      `[직원 보고 ${i + 1}] ${r.employeeName} / ${r.department}\n${r.result}`
    ).join('\n\n---\n\n');

    return [
      `당신은 AI 회사의 팀장 '${manager.name}'입니다.`,
      `프로젝트: ${project.name}`,
      `CEO 목표: ${project.objective}`,
      '',
      '아래 직원들의 결과를 검토하고 중복/충돌/누락을 정리해 CEO에게 하나의 최종 보고서를 작성하세요.',
      '',
      evidence,
      '',
      '최종 보고 형식:',
      '1. Executive Summary',
      '2. 직원별 핵심 발견',
      '3. 통합 전략',
      '4. 실행 우선순위',
      '5. 리스크와 의사결정 필요사항',
      '6. 다음 액션'
    ].join('\n');
  }

  function createProject() {
    const modal = document.querySelector('#projectModal');
    const name = modal.querySelector('#projectName').value.trim();
    const objective = modal.querySelector('#projectObjective').value.trim();
    const managerId = modal.querySelector('#projectManager').value;
    const memberIds = [...modal.querySelectorAll('#projectMembers input:checked')].map(x => x.value);
    const autoRun = modal.querySelector('#projectAuto').value === 'yes';

    if (!name || !objective) return alert('프로젝트명과 CEO 목표를 입력하세요.');
    if (!managerId) return alert('팀장을 선택하세요.');
    if (!memberIds.length) return alert('참여 직원을 한 명 이상 선택하세요.');

    const project = {
      id: uid(), name, objective, managerId, memberIds, autoRun,
      status: 'working', createdAt: Date.now(), taskIds: [], finalTaskId: null
    };

    for (const employeeId of memberIds) {
      if (employeeId === managerId && memberIds.length > 1) continue;
      const e = state.employees.find(x => x.id === employeeId);
      if (!e) continue;
      const task = {
        id: uid(), employeeId: e.id, employeeName: e.name,
        department: e.department, provider: e.provider,
        task: `[${project.name}] ${e.role} 관점의 업무 수행`,
        prompt: projectPrompt(e, project),
        status: e.provider === 'demo' ? 'done' : 'queued',
        startedAt: Date.now(), projectId: project.id, taskType: 'project-work'
      };
      if (e.provider === 'demo') task.finishedAt = Date.now();
      state.tasks.unshift(task);
      project.taskIds.push(task.id);

      if (e.provider === 'demo') {
        state.reports.unshift({
          id: uid(), employeeId:e.id, employeeName:e.name, department:e.department,
          provider:e.provider, task:task.task, taskId:task.id, projectId:project.id,
          result:`[DEMO] ${e.role} 관점의 프로젝트 업무가 완료되었습니다.`, createdAt:Date.now()
        });
      }
    }

    state.projects.unshift(project);
    persist();
    modal.classList.add('hidden');
    renderAll();
    renderProjects();

    if (autoRun) {
      for (const id of project.taskIds) {
        const t = state.tasks.find(x => x.id === id);
        if (t && t.status === 'queued') {
          window.dispatchEvent(new CustomEvent('ai-office-enqueue-task', { detail:{ id } }));
        }
      }
    }
  }

  function maybeCreateManagerTask(project) {
    if (!project || project.finalTaskId || project.status === 'done') return;
    const workTasks = project.taskIds.map(id => state.tasks.find(t => t.id === id)).filter(Boolean);
    if (!workTasks.length || workTasks.some(t => t.status !== 'done')) return;

    const reports = state.reports.filter(r => r.projectId === project.id && r.taskId && project.taskIds.includes(r.taskId));
    if (reports.length < workTasks.length) return;

    const manager = state.employees.find(e => e.id === project.managerId);
    if (!manager) {
      project.status = 'blocked';
      return;
    }

    const task = {
      id: uid(),
      employeeId: manager.id,
      employeeName: manager.name,
      department: manager.department,
      provider: manager.provider,
      task: `[${project.name}] 팀장 최종 취합 및 CEO 보고`,
      prompt: managerPrompt(manager, project, reports),
      status: manager.provider === 'demo' ? 'done' : 'queued',
      startedAt: Date.now(),
      projectId: project.id,
      taskType: 'project-final'
    };

    state.tasks.unshift(task);
    project.finalTaskId = task.id;
    project.status = 'review';

    if (manager.provider === 'demo') {
      task.finishedAt = Date.now();
      state.reports.unshift({
        id:uid(), employeeId:manager.id, employeeName:manager.name, department:manager.department,
        provider:manager.provider, task:task.task, taskId:task.id, projectId:project.id,
        result:'[DEMO] 팀장 최종 취합 보고가 완료되었습니다.', createdAt:Date.now()
      });
      project.status = 'done';
      project.finishedAt = Date.now();
    }

    persist();
    if (project.autoRun && task.status === 'queued') {
      setTimeout(() => window.dispatchEvent(new CustomEvent('ai-office-enqueue-task', { detail:{ id:task.id } })), 100);
    }
  }

  function syncProjectStatus(project) {
    if (project.finalTaskId) {
      const finalTask = state.tasks.find(t => t.id === project.finalTaskId);
      if (finalTask?.status === 'done') {
        project.status = 'done';
        project.finishedAt = project.finishedAt || Date.now();
      } else if (finalTask) {
        project.status = 'review';
      }
    } else {
      maybeCreateManagerTask(project);
    }
  }

  function renderProjects() {
    state.projects.forEach(syncProjectStatus);
    persist();

    const wrap = document.querySelector('#projectCards');
    if (!wrap) return;
    if (!state.projects.length) {
      wrap.innerHTML = '<div class="empty">아직 프로젝트가 없습니다. CEO 목표를 하나 만들어보세요.</div>';
      return;
    }

    wrap.innerHTML = state.projects.map(p => {
      const manager = state.employees.find(e => e.id === p.managerId);
      const work = p.taskIds.map(id => state.tasks.find(t => t.id === id)).filter(Boolean);
      const done = work.filter(t => t.status === 'done').length;
      const finalTask = p.finalTaskId ? state.tasks.find(t => t.id === p.finalTaskId) : null;
      const statusLabel = p.status === 'done' ? '✅ 완료' : p.status === 'review' ? '🧑‍💼 팀장 취합' : p.status === 'blocked' ? '⚠ 차단' : '⚡ 진행중';

      return `
        <article class="project-card">
          <div class="project-head">
            <div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.objective)}</p></div>
            <span class="project-status">${statusLabel}</span>
          </div>
          <div class="project-meta">팀장: ${escapeHtml(manager?.name || '없음')} · 직원 업무 ${done}/${work.length}</div>
          <div class="project-progress"><span style="width:${work.length ? Math.round(done/work.length*100) : 0}%"></span></div>
          <div class="project-task-list">
            ${work.map(t => `<div><span>${t.status==='done'?'✅':t.status==='working'?'⚡':'○'}</span> ${escapeHtml(t.employeeName)} · ${escapeHtml(t.task)}</div>`).join('')}
            ${finalTask ? `<div class="manager-task"><span>${finalTask.status==='done'?'✅':'🧑‍💼'}</span> ${escapeHtml(finalTask.employeeName)} · 최종 취합</div>` : ''}
          </div>
          <div class="card-actions">
            <button class="btn ghost open-project-tasks" data-id="${p.id}">관련 업무 보기</button>
            <button class="btn ghost delete-project" data-id="${p.id}">프로젝트 삭제</button>
          </div>
        </article>
      `;
    }).join('');

    wrap.querySelectorAll('.open-project-tasks').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      showTaskView();
      document.querySelectorAll('.task-item').forEach(el => {
        const btn = el.querySelector('[data-id]');
        const t = btn ? state.tasks.find(x => x.id === btn.dataset.id) : null;
        el.style.display = t?.projectId === id ? '' : 'none';
      });
    });

    wrap.querySelectorAll('.delete-project').forEach(b => b.onclick = () => deleteProject(b.dataset.id));
  }

  function showTaskView() {
    document.querySelector('.nav[data-view="tasks"]')?.click();
  }

  function deleteProject(id) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    if (!confirm('프로젝트와 연결된 업무를 모두 삭제할까요? 완료 보고서는 유지됩니다.')) return;

    const ids = new Set([...p.taskIds, p.finalTaskId].filter(Boolean));
    state.tasks = state.tasks.filter(t => !ids.has(t.id));
    state.projects = state.projects.filter(x => x.id !== id);
    persist();
    renderAll();
    renderProjects();
  }

  function ensureTaskManager() {
    const taskSection = document.querySelector('#tasksView .section-actions');
    if (taskSection && !document.querySelector('#clearCompletedTasks')) {
      const box = document.createElement('div');
      box.className = 'task-management-actions';
      box.innerHTML = '<button id="clearCompletedTasks" class="btn ghost">완료 업무 삭제</button><button id="clearAllTasks" class="btn ghost">전체 업무 삭제</button>';
      taskSection.appendChild(box);

      box.querySelector('#clearCompletedTasks').onclick = () => {
        if (!confirm('완료된 업무 기록을 삭제할까요? 보고서는 유지됩니다.')) return;
        const deleted = new Set(state.tasks.filter(t => t.status === 'done').map(t => t.id));
        state.tasks = state.tasks.filter(t => t.status !== 'done');
        state.projects.forEach(p => {
          p.taskIds = p.taskIds.filter(id => !deleted.has(id));
          if (deleted.has(p.finalTaskId)) p.finalTaskId = null;
        });
        persist(); renderAll(); renderProjects();
      };

      box.querySelector('#clearAllTasks').onclick = () => {
        if (!confirm('모든 업무 기록을 삭제할까요? 진행 중인 자동화 결과도 무시됩니다. 보고서는 유지됩니다.')) return;
        state.tasks = [];
        state.projects.forEach(p => { p.taskIds = []; p.finalTaskId = null; p.status = 'blocked'; });
        persist(); renderAll(); renderProjects();
      };
    }
  }

  function ensureTaskButtons() {
    document.querySelectorAll('.task-item[data-task-id]').forEach(card => {
      let action = card.querySelector('.mini-actions');
      if (!action) {
        action = document.createElement('div');
        action.className = 'mini-actions';
        card.appendChild(action);
      }
      if (action.querySelector('.task-delete-btn')) return;

      const id = card.dataset.taskId;
      const task = state.tasks.find(t => t.id === id);
      if (!task) return;

      if (task.status !== 'done') {
        const edit = document.createElement('button');
        edit.className = 'text-btn task-edit-btn';
        edit.textContent = '수정';
        edit.dataset.id = id;
        edit.onclick = () => editTask(id);
        action.appendChild(edit);
      }

      const del = document.createElement('button');
      del.className = 'text-btn task-delete-btn';
      del.textContent = '삭제';
      del.dataset.id = id;
      del.onclick = () => deleteTask(id);
      action.appendChild(del);
    });
  }

  function editTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    if (t.status === 'working') return alert('현재 자동 실행 중인 업무는 수정할 수 없습니다. 완료되거나 실패한 뒤 수정하세요.');

    const next = prompt('업무 내용을 수정하세요.', t.task);
    if (next === null) return;
    const value = next.trim();
    if (!value) return alert('업무 내용은 비워둘 수 없습니다.');

    t.task = value;
    const e = state.employees.find(x => x.id === t.employeeId);
    if (e && t.taskType !== 'project-final') t.prompt = buildPrompt(e, value);
    t.automationError = null;
    if (t.status === 'opened') t.status = 'queued';
    persist(); renderAll(); renderProjects();
  }

  function deleteTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    if (!confirm(`'${t.employeeName}'의 이 업무를 삭제할까요?`)) return;

    state.tasks = state.tasks.filter(x => x.id !== id);
    state.projects.forEach(p => {
      p.taskIds = p.taskIds.filter(x => x !== id);
      if (p.finalTaskId === id) p.finalTaskId = null;
    });
    persist(); renderAll(); renderProjects();
  }

  ensureProjectModal();
  document.querySelector('#newProjectBtn')?.addEventListener('click', openProjectModal);

  const originalRenderAll = renderAll;
  renderAll = function() {
    originalRenderAll();
    ensureTaskManager();
    ensureTaskButtons();
    if (document.querySelector('#projectsView')?.classList.contains('active')) renderProjects();
  };

  const observer = new MutationObserver(() => {
    ensureTaskManager();
    ensureTaskButtons();
  });
  observer.observe(document.body, { childList:true, subtree:true });

  ensureTaskManager();
  ensureTaskButtons();
  renderProjects();
})();