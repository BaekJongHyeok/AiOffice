(() => {
  const officeView = document.querySelector('#officeView');
  if (!officeView) return;

  const companyUI = {
    selectedEmployeeId: null,
    tick: null,
  };

  const rolePalette = (employee) => {
    const s = `${employee.department || ''} ${employee.role || ''}`.toLowerCase();
    if (/마케팅|콘텐츠/.test(s)) return { main:'#f65ca8', dark:'#8f285f', accent:'#ffd2e8' };
    if (/개발|엔지니어|코드/.test(s)) return { main:'#58a6ff', dark:'#245c9a', accent:'#d3e8ff' };
    if (/디자인/.test(s)) return { main:'#a875ff', dark:'#5938a0', accent:'#eadcff' };
    if (/qa|검수|품질/.test(s)) return { main:'#54d39a', dark:'#237a58', accent:'#d6f8e9' };
    if (/분석|데이터|리서치/.test(s)) return { main:'#44d77b', dark:'#237044', accent:'#d8ffe5' };
    if (/팀장|대표|ceo/.test(`${employee.rank || ''} ${employee.role || ''}`.toLowerCase())) return { main:'#f3b64e', dark:'#9a651a', accent:'#fff0c6' };
    return { main:'#7c8cff', dark:'#4050a6', accent:'#dfe3ff' };
  };

  function pixelAvatar(employee, status='idle', large=false) {
    const p = rolePalette(employee);
    const hair = employee.id ? ['#332016','#171922','#4a2a25','#1d2734'][Math.abs(hashCode(employee.id)) % 4] : '#302018';
    const glasses = /개발|분석|qa|검수/.test(`${employee.department} ${employee.role}`.toLowerCase());
    const accessory = /마케팅/.test(`${employee.department} ${employee.role}`) ? '🎧' : /디자인/.test(`${employee.department} ${employee.role}`) ? '✏️' : '';
    const cls = large ? 'pixel-avatar large' : 'pixel-avatar';
    return `
      <div class="${cls} state-${status}" style="--role:${p.main};--role-dark:${p.dark};--hair:${hair};--accent:${p.accent}">
        <div class="px-shadow"></div>
        <div class="px-body">
          <span class="px-leg l"></span><span class="px-leg r"></span>
          <span class="px-torso"></span>
          <span class="px-arm l"></span><span class="px-arm r"></span>
          <span class="px-neck"></span>
          <span class="px-head"></span>
          <span class="px-hair top"></span><span class="px-hair side"></span>
          <span class="px-eye l"></span><span class="px-eye r"></span>
          ${glasses ? '<span class="px-glasses"></span>' : ''}
          <span class="px-device"></span>
          ${accessory ? `<span class="px-accessory">${accessory}</span>` : ''}
        </div>
      </div>`;
  }

  function hashCode(str='') {
    let h=0; for(let i=0;i<str.length;i++) h=((h<<5)-h)+str.charCodeAt(i)|0; return h;
  }

  function activeTask(employeeId) {
    return state.tasks.find(t => t.employeeId === employeeId && ['queued','working','opened'].includes(t.status));
  }

  function recentDoneTask(employeeId) {
    return state.tasks.find(t => t.employeeId === employeeId && t.status === 'done' && Date.now() - (t.finishedAt || 0) < 20000);
  }

  function employeeVisualState(employee) {
    const task = activeTask(employee.id);
    const done = recentDoneTask(employee.id);
    if (done) {
      const elapsed = Date.now() - done.finishedAt;
      if (done.taskType === 'project-final') return elapsed < 11000 ? 'ceo-report' : 'done';
      return elapsed < 7000 ? 'moving-report' : elapsed < 14000 ? 'reporting' : 'done';
    }
    if (!task) return 'idle';
    if (task.status === 'queued') return 'moving';
    if (task.status === 'opened' && task.automationError) return 'blocked';

    const elapsed = Date.now() - (task.automationStartedAt || task.startedAt || Date.now());
    const project = task.projectId ? state.projects.find(p => p.id === task.projectId) : null;
    const coworkers = project ? project.taskIds
      .map(id => state.tasks.find(t => t.id === id))
      .filter(t => t && ['queued','working','opened'].includes(t.status)).length : 0;

    if (task.taskType === 'project-final') return 'ceo-report';
    if (project && coworkers >= 2 && elapsed > 7000 && elapsed < 18000) return 'meeting';
    return task.status === 'working' ? 'working' : 'moving';
  }

  const statusMeta = {
    idle: ['자리 비움','휴식/대기','○'],
    moving: ['이동 중','업무 자리로 이동','🚶'],
    working: ['근무 중','업무 수행 중','●'],
    meeting: ['회의 중','프로젝트 회의','👥'],
    'moving-report': ['이동 중','팀장에게 보고하러 이동','🚶'],
    reporting: ['보고 중','팀장에게 결과 보고','📨'],
    'ceo-report': ['최종 보고 중','CEO에게 최종 보고','👑'],
    done: ['업무 완료','업무 완료','✓'],
    blocked: ['확인 필요','자동화 확인 필요','!'],
  };

  function buildCompanyShell() {
    officeView.innerHTML = `
      <div class="company-toolbar card">
        <div>
          <div class="company-kicker">🏢 MY AI COMPANY</div>
          <h2>AI 직원들과 함께 일하는 회사</h2>
          <p>직원을 클릭하면 현재 업무와 상세 정보를 확인하고 바로 관리할 수 있습니다.</p>
        </div>
        <div id="companyStats" class="company-stats"></div>
      </div>

      <div class="company-layout">
        <section class="sim-office card">
          <div class="office-wall-title">AI OFFICE <span>LIVE FLOOR</span></div>
          <div class="sim-room meeting-room">
            <div class="sim-room-label">👥 회의실</div>
            <div class="meeting-table"><span></span></div>
          </div>
          <div class="sim-room manager-room">
            <div class="sim-room-label">🧑‍💼 팀장석</div>
            <div class="pixel-desk compact"></div>
          </div>
          <div class="sim-room ceo-room">
            <div class="sim-room-label">👑 CEO</div>
            <div class="pixel-desk executive"></div>
          </div>
          <div class="office-decoration deco-1">🪴</div>
          <div class="office-decoration deco-2">📚</div>
          <div class="office-decoration deco-3">☕</div>
          <div id="simEmployees" class="sim-employees"></div>
          <div id="officeActivity" class="office-activity"></div>
        </section>

        <aside id="employeeInspector" class="employee-inspector card"></aside>
      </div>

      <section class="quick-directive card">
        <div class="quick-directive-head">
          <div><h3>👑 CEO 빠른 업무 지시</h3><p>회사 화면을 떠나지 않고 직원에게 바로 업무를 배정합니다.</p></div>
          <label class="quick-auto"><input id="autoRunToggle" type="checkbox" checked> 자동 실행</label>
        </div>
        <textarea id="taskInput" placeholder="예: 신규 고객 유치를 위한 실행 가능한 마케팅 전략을 만들어줘."></textarea>
        <div class="quick-directive-bottom">
          <div id="assigneeList" class="assignee-list quick-assignees"></div>
          <div class="quick-directive-actions">
            <button id="selectAllBtnCompany" class="btn ghost">전체 선택</button>
            <button id="runTaskBtnCompany" class="btn primary">▶ 업무 배정</button>
          </div>
        </div>
      </section>
    `;

    const selectAll = document.querySelector('#selectAllBtnCompany');
    const run = document.querySelector('#runTaskBtnCompany');
    if (selectAll) selectAll.onclick = () => document.querySelectorAll('#assigneeList input').forEach(x => x.checked = true);
    if (run) run.onclick = async () => {
      const before = new Set(state.tasks.map(t => t.id));
      await runTasks();
      const created = state.tasks.filter(t => !before.has(t.id) && t.status === 'queued');
      if (document.querySelector('#autoRunToggle')?.checked) {
        created.forEach(t => window.dispatchEvent(new CustomEvent('ai-office-enqueue-task', { detail:{ id:t.id } })));
      }
      setTimeout(() => switchView('office'), 20);
    };
  }
  }

  function employeePosition(index, visualState) {
    const deskPositions = [
      [13,28],[34,28],[55,28],
      [13,59],[34,59],[55,59],
      [23,76],[48,76],[66,60]
    ];
    const base = deskPositions[index % deskPositions.length];
    const manager = [76,58], meeting=[77,24], ceo=[88,25];

    if (visualState === 'meeting') return meeting;
    if (visualState === 'reporting' || visualState === 'moving-report') return manager;
    if (visualState === 'ceo-report') return ceo;
    return base;
  }

  function renderCompanyOffice() {
    if (!document.querySelector('#simEmployees')) buildCompanyShell();
    const wrap = document.querySelector('#simEmployees');
    if (!wrap) return;

    if (!companyUI.selectedEmployeeId || !state.employees.some(e => e.id === companyUI.selectedEmployeeId)) {
      companyUI.selectedEmployeeId = state.employees[0]?.id || null;
    }

    wrap.innerHTML = state.employees.slice(0,9).map((employee,index) => {
      const vstate = employeeVisualState(employee);
      const pos = employeePosition(index,vstate);
      const meta = statusMeta[vstate] || statusMeta.idle;
      const task = activeTask(employee.id) || recentDoneTask(employee.id);
      const selected = companyUI.selectedEmployeeId === employee.id;
      return `
        <button class="sim-employee ${selected?'selected':''} sim-${vstate}" data-id="${employee.id}" style="--x:${pos[0]}%;--y:${pos[1]}%;--delay:${index*70}ms">
          <div class="employee-status-bubble">
            <span class="status-dot-mini ${vstate}"></span>
            <b>${escapeHtml(employee.name)}</b>
            <small>${escapeHtml(meta[0])}</small>
          </div>
          <div class="employee-character">${pixelAvatar(employee,vstate)}</div>
          <div class="pixel-workstation"><span class="monitor"></span><span class="desk-line"></span></div>
          <div class="employee-task-caption">${escapeHtml(task?.task?.slice(0,30) || employee.role || '대기')}</div>
        </button>`;
    }).join('');

    wrap.querySelectorAll('.sim-employee').forEach(el => {
      el.onclick = () => {
        companyUI.selectedEmployeeId = el.dataset.id;
        renderCompanyOffice();
      };
    });

    const assignees=document.querySelector('#assigneeList');
    if(assignees){
      assignees.innerHTML=state.employees.map(e=>`<label class="assignee"><input type="checkbox" value="${e.id}"><span>${e.avatar||'🧑‍💼'} ${escapeHtml(e.name)} · ${escapeHtml(e.role)}</span><span class="provider">${providerLabel[e.provider]||e.provider}</span></label>`).join('');
    }
    renderInspector();
    renderStats();
    renderActivity();
  }

  function renderStats() {
    const stats = { working:0, meeting:0, moving:0, reporting:0, idle:0 };
    state.employees.forEach(e => {
      const s = employeeVisualState(e);
      if (s === 'working') stats.working++;
      else if (s === 'meeting') stats.meeting++;
      else if (['moving','moving-report'].includes(s)) stats.moving++;
      else if (['reporting','ceo-report'].includes(s)) stats.reporting++;
      else stats.idle++;
    });
    const el=document.querySelector('#companyStats');
    if(!el) return;
    el.innerHTML=`
      <div><strong>${stats.working}</strong><span>근무 중</span></div>
      <div><strong>${stats.meeting}</strong><span>회의 중</span></div>
      <div><strong>${stats.moving}</strong><span>이동 중</span></div>
      <div><strong>${stats.reporting}</strong><span>보고 중</span></div>`;
  }

  function renderActivity() {
    const el=document.querySelector('#officeActivity'); if(!el) return;
    const rows = state.tasks.slice(0,4).map(t => {
      const label = t.status==='done'?'완료':t.status==='working'?'진행':'대기';
      return `<div><span>${new Date(t.finishedAt||t.startedAt||Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span><b>${escapeHtml(t.employeeName)}</b><em>${label}</em><small>${escapeHtml(t.task.slice(0,38))}</small></div>`;
    });
    el.innerHTML = `<h4>최근 활동</h4>${rows.join('') || '<p>아직 활동 기록이 없습니다.</p>'}`;
  }

  function renderInspector() {
    const panel=document.querySelector('#employeeInspector'); if(!panel) return;
    const e=state.employees.find(x=>x.id===companyUI.selectedEmployeeId);
    if(!e){panel.innerHTML='<div class="employee-empty">직원을 채용하면 상세 정보가 표시됩니다.</div>';return}

    const task=activeTask(e.id);
    const recent=state.reports.find(r=>r.employeeId===e.id);
    const vstate=employeeVisualState(e);
    const meta=statusMeta[vstate]||statusMeta.idle;
    const progress = task ? (task.status==='working'?65:task.status==='queued'?15:task.status==='opened'?40:100) : 0;
    const project=task?.projectId?state.projects.find(p=>p.id===task.projectId):null;

    panel.innerHTML=`
      <div class="inspector-profile">
        <div class="inspector-avatar">${pixelAvatar(e,vstate,true)}</div>
        <div>
          <div class="inspector-name-line"><h2>${escapeHtml(e.name)}</h2><span>${escapeHtml(e.rank||'사원')}</span></div>
          <p>${escapeHtml(e.department||'미지정')} · ${providerIcon[e.provider]||''} ${providerLabel[e.provider]||e.provider}</p>
          <div class="status-chip ${vstate}"><i></i>${escapeHtml(meta[0])} · ${escapeHtml(meta[1])}</div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="section-title"><h3>현재 업무</h3>${task?'<span class="live-tag">LIVE</span>':''}</div>
        ${task ? `
          <div class="current-task-box">
            <b>${escapeHtml(task.task)}</b>
            ${project?`<small>프로젝트 · ${escapeHtml(project.name)}</small>`:''}
            <div class="task-progress"><span style="width:${progress}%"></span></div>
            <div class="task-progress-meta"><span>진행 단계</span><strong>${progress}%</strong></div>
            ${task.automationError?`<p class="inline-error">${escapeHtml(task.automationError)}</p>`:''}
          </div>` : '<div class="no-current-task">현재 진행 중인 업무가 없습니다.</div>'}
      </div>

      <div class="inspector-section">
        <div class="section-title"><h3>직원 정보</h3></div>
        <dl class="employee-info-grid">
          <dt>역할</dt><dd>${escapeHtml(e.role||'일반 업무')}</dd>
          <dt>업무 스타일</dt><dd>${escapeHtml(e.traits||'미설정')}</dd>
          <dt>연결 AI</dt><dd>${providerIcon[e.provider]||''} ${providerLabel[e.provider]||e.provider}</dd>
        </dl>
      </div>

      <div class="inspector-section">
        <div class="section-title"><h3>최근 보고</h3></div>
        ${recent?`<div class="recent-report-mini"><b>${escapeHtml(recent.task)}</b><p>${escapeHtml(String(recent.result||'').slice(0,170))}${String(recent.result||'').length>170?'…':''}</p></div>`:'<div class="no-current-task">아직 보고 기록이 없습니다.</div>'}
      </div>

      <div class="inspector-actions">
        <button class="btn ghost inspector-edit">✏ 정보 수정</button>
        <button class="btn ghost inspector-task" ${task?'':'disabled'}>📋 업무 상세</button>
        <button class="btn primary inspector-employee">⚙ 직원 관리</button>
      </div>`;

    panel.querySelector('.inspector-edit')?.addEventListener('click',()=>openEmployeeModal(e.id));
    panel.querySelector('.inspector-employee')?.addEventListener('click',()=>switchView('employees'));
    panel.querySelector('.inspector-task')?.addEventListener('click',()=>{
      switchView('tasks');
      setTimeout(()=>{
        const el=document.querySelector(`.task-item[data-task-id="${task?.id}"]`);
        el?.scrollIntoView({behavior:'smooth',block:'center'});
        el?.classList.add('task-highlight');
        setTimeout(()=>el?.classList.remove('task-highlight'),1800);
      },50);
    });
  }

  buildCompanyShell();
  const version = document.querySelector('.sidebar-foot small');
  if (version) version.textContent = 'v0.5.0 · Company Simulation';

  try {
    renderOffice = renderCompanyOffice;
  } catch {}

  renderCompanyOffice();

  if (companyUI.tick) clearInterval(companyUI.tick);
  companyUI.tick = setInterval(() => {
    if (document.querySelector('#officeView')?.classList.contains('active')) renderCompanyOffice();
  }, 1800);

  window.addEventListener('ai-office-task-completed', () => renderCompanyOffice());
})();