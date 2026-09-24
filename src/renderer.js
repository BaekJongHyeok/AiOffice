const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const providerLabel = { demo:'DEMO', chatgpt:'ChatGPT', claude:'Claude', gemini:'Gemini' };
const providerIcon = { demo:'🧪', chatgpt:'🟢', claude:'🟠', gemini:'🔵' };

const defaultEmployees = [
  { id: uid(), name: '김기획', rank: '팀장', department: '기획팀', provider: 'chatgpt', role: '시장 조사 및 사업 전략', traits: '논리적이고 구조적으로 보고한다.', avatar: '🧑‍💼' },
  { id: uid(), name: '박마케팅', rank: '대리', department: '마케팅팀', provider: 'claude', role: '콘텐츠 및 마케팅 전략', traits: '창의적인 아이디어를 다양하게 제안한다.', avatar: '👩‍💼' },
  { id: uid(), name: '이검수', rank: '과장', department: 'QA팀', provider: 'gemini', role: '결과 검수 및 리스크 확인', traits: '빠진 내용과 위험요소를 꼼꼼히 찾는다.', avatar: '👨‍💼' },
];

function migrateEmployees(raw) {
  if (!raw) return defaultEmployees;
  return raw.map(e => ({
    ...e,
    provider: e.provider === 'openai' ? 'chatgpt' : e.provider === 'anthropic' ? 'claude' : (e.provider || 'chatgpt'),
    model: undefined,
  }));
}

const state = {
  employees: migrateEmployees(JSON.parse(localStorage.getItem('aiOffice.employees') || 'null')),
  tasks: JSON.parse(localStorage.getItem('aiOffice.tasks') || '[]').map(t => t.status === 'working' ? {...t, status:'queued'} : t),
  reports: JSON.parse(localStorage.getItem('aiOffice.reports') || '[]'),
  projects: JSON.parse(localStorage.getItem('aiOffice.projects') || '[]'),
  editingId: null,
  resultTaskId: null,
  sessionInfo: {},
};

function persist(){
  localStorage.setItem('aiOffice.employees', JSON.stringify(state.employees));
  localStorage.setItem('aiOffice.tasks', JSON.stringify(state.tasks.slice(0,150)));
  localStorage.setItem('aiOffice.reports', JSON.stringify(state.reports.slice(0,150)));
  localStorage.setItem('aiOffice.projects', JSON.stringify(state.projects.slice(0,100)));
  localStorage.removeItem('aiOffice.settings');
}

function buildPrompt(employee, task) {
  return [
    `당신은 가상의 AI 회사에서 '${employee.name}'이라는 직원입니다.`,
    `부서: ${employee.department || '미지정'}`,
    `직급: ${employee.rank || '사원'}`,
    `담당 역할: ${employee.role || '일반 업무'}`,
    `업무 스타일: ${employee.traits || '정확하고 간결하게 업무를 수행함'}`,
    '',
    '[CEO 업무 지시]',
    task,
    '',
    '위 업무를 담당 역할에 맞게 수행하세요. 마지막에는 반드시 아래 형식으로 CEO에게 보고하세요.',
    '1. 핵심 결과',
    '2. 근거/판단',
    '3. 리스크 또는 확인이 필요한 점',
    '4. 다음 액션',
  ].join('\n');
}

function renderAll(){ renderOffice(); renderEmployees(); renderTasks(); renderReports(); renderSubscriptionCards(); }

function renderOffice(){
  const floor = $('#employeeFloor'); floor.innerHTML='';
  state.employees.slice(0,9).forEach((e)=>{
    const active = state.tasks.find(t=>t.employeeId===e.id && ['queued','working','opened'].includes(t.status));
    const recentlyDone = state.tasks.find(t=>t.employeeId===e.id && t.status==='done' && Date.now()-t.finishedAt<7000);
    const el=document.createElement('div'); el.className=`workstation ${active?'busy':recentlyDone?'done':''}`;
    el.innerHTML=`<div class="bubble">${active?'💭':recentlyDone?'✅':'☕'}</div><div class="desk-mini">🖥️</div><div class="worker">${e.avatar||'🧑‍💼'}</div><div class="worker-name">${escapeHtml(e.name)} · ${escapeHtml(e.department)}</div><div class="brain">${providerIcon[e.provider]||''}</div>`;
    floor.appendChild(el);
  });
  const list=$('#assigneeList'); list.innerHTML='';
  if(!state.employees.length) list.innerHTML='<div class="muted">먼저 직원을 채용하세요.</div>';
  state.employees.forEach(e=>{const row=document.createElement('label');row.className='assignee';row.innerHTML=`<input type="checkbox" value="${e.id}"><span>${e.avatar||'🧑‍💼'} ${escapeHtml(e.name)} · ${escapeHtml(e.role)}</span><span class="provider">${providerLabel[e.provider]||e.provider}</span>`;list.appendChild(row)});
  const live=state.tasks.filter(t=>['queued','working','opened'].includes(t.status)); $('#busyCount').textContent=`${live.length}건 대기`;
  const stream=$('#liveTasks');
  if(!live.length){stream.className='task-stream empty';stream.innerHTML='대기 중인 업무가 없습니다.'}else{stream.className='task-stream';stream.innerHTML=live.slice(0,8).map(t=>`<div class="task-item" data-task-id="${t.id}"><div class="task-top"><b>${escapeHtml(t.employeeName)}</b><span>${t.status==='working'?'⚡ 작업중':t.status==='opened'?'AI 창 열림':'대기 중'}</span></div><div class="task-meta">${providerLabel[t.provider]} · ${escapeHtml(t.task)}</div><div class="mini-actions"><button class="text-btn open-ai" data-id="${t.id}">AI 열기</button><button class="text-btn finish-task" data-id="${t.id}">결과 입력</button></div></div>`).join('')}
  $$('.open-ai').forEach(b=>b.onclick=()=>openTaskInProvider(b.dataset.id));
  $$('.finish-task').forEach(b=>b.onclick=()=>openResultModal(b.dataset.id));
  const recent=state.reports.filter(isReportUsable).sort((a,b)=>(b.finalProjectReport?1:0)-(a.finalProjectReport?1:0)||b.createdAt-a.createdAt).slice(0,3);const rr=$('#recentReports');
  if(!recent.length){rr.className='report-list empty';rr.innerHTML='완료된 보고가 없습니다.'}else{rr.className='report-list';rr.innerHTML=recent.map(r=>`<div class="report-item"><div class="report-top"><b>${escapeHtml(r.employeeName)}</b><span>✅ 완료</span></div><div class="report-meta">${escapeHtml(r.task.slice(0,70))}</div></div>`).join('')}
  $('#reportBadge').textContent=state.reports.length;
}

function renderEmployees(){
  const wrap=$('#employeeCards');
  if(!state.employees.length){wrap.innerHTML='<div class="empty">직원이 없습니다.</div>';return}
  wrap.innerHTML=state.employees.map(e=>`<div class="employee-card"><div class="face">${e.avatar||'🧑‍💼'}</div><h3>${escapeHtml(e.name)} <span class="tag">${escapeHtml(e.rank)}</span></h3><div><span class="tag">${escapeHtml(e.department)}</span><span class="tag">${providerIcon[e.provider]||''} ${providerLabel[e.provider]||e.provider}</span></div><p>${escapeHtml(e.role)}</p><div class="card-actions"><button class="btn ghost edit-emp" data-id="${e.id}">수정</button><button class="btn ghost open-provider" data-provider="${e.provider}" ${e.provider==='demo'?'disabled':''}>AI 열기</button><button class="btn ghost delete-emp" data-id="${e.id}">퇴사</button></div></div>`).join('');
  $$('.edit-emp').forEach(b=>b.onclick=()=>openEmployeeModal(b.dataset.id));
  $$('.open-provider').forEach(b=>b.onclick=()=>openProvider(b.dataset.provider));
  $$('.delete-emp').forEach(b=>b.onclick=()=>{if(confirm('이 직원을 삭제할까요?')){state.employees=state.employees.filter(e=>e.id!==b.dataset.id);persist();renderAll()}});
}

function renderTasks(){
  const pending=state.tasks.filter(t=>['queued','working','opened'].includes(t.status));const done=state.tasks.filter(t=>t.status==='done');
  $('#taskBoard').innerHTML=`<div class="board-col"><h3>🟡 대기/진행 (${pending.length})</h3>${pending.map(taskCard).join('')||'<div class="muted">대기 업무 없음</div>'}</div><div class="board-col"><h3>🟢 완료 (${done.length})</h3>${done.slice(0,40).map(taskCard).join('')||'<div class="muted">완료 업무 없음</div>'}</div>`;
  $$('.board-open').forEach(b=>b.onclick=()=>openTaskInProvider(b.dataset.id));
  $$('.board-copy').forEach(b=>b.onclick=()=>copyTaskPrompt(b.dataset.id));
  $$('.board-finish').forEach(b=>b.onclick=()=>openResultModal(b.dataset.id));
}
function taskCard(t){
  const actions=t.status==='done'?'':`<div class="mini-actions"><button class="text-btn board-open" data-id="${t.id}">AI 열기</button><button class="text-btn board-copy" data-id="${t.id}">프롬프트 복사</button><button class="text-btn board-finish" data-id="${t.id}">결과 입력</button></div>`;
  return `<div class="task-item" data-task-id="${t.id}"><div class="task-top"><b>${escapeHtml(t.employeeName)}</b><span>${t.status==='queued'?'대기':t.status==='working'?'⚡ 작업중':t.status==='opened'?(t.automationError?'⚠ 자동화 실패':'AI 창 열림'):'완료'}</span></div><div class="task-meta">${providerLabel[t.provider]||t.provider} · ${escapeHtml(t.task)}</div>${t.automationError?`<div class="task-error">${escapeHtml(t.automationError)}</div>`:''}${actions}</div>`;
}

function isReportUsable(report){
  const text=String(report?.result||'').trim();
  if(text.length<120) return false;
  const markers=['[CEO 목표]','[프로젝트]','보고 형식:','당신은 AI 회사'];
  return markers.filter(m=>text.includes(m)).length<3;
}

function formatExecutiveReport(text=''){
  const lines=String(text).split(/\r?\n/);
  let html='';
  let inList=false;
  const closeList=()=>{if(inList){html+='</ul>';inList=false;}};
  for(const raw of lines){
    const line=raw.trim();
    if(!line){closeList();continue}
    const heading=line.match(/^(?:#{1,3}\s*)?(\d+\.\s+.+|CEO 결론|추천안 TOP 3|실행 계획|근거|숫자로 보는 판단|리스크와 실패 조건|CEO 의사결정 필요사항|바로 실행할 다음 업무)$/i);
    if(heading){closeList();html+=`<h4>${escapeHtml(line.replace(/^#{1,3}\s*/,''))}</h4>`;continue}
    if(/^[-*•]\s+/.test(line)){if(!inList){html+='<ul>';inList=true;}html+=`<li>${escapeHtml(line.replace(/^[-*•]\s+/,''))}</li>`;continue}
    closeList();
    html+=`<p>${escapeHtml(line)}</p>`;
  }
  closeList();
  return html;
}

function renderReports(){
  const wrap=$('#reportsFull');
  if(!state.reports.length){wrap.innerHTML='<div class="empty">아직 보고가 없습니다.</div>';return}

  const usable=state.reports.filter(isReportUsable);
  const finalReports=usable.filter(r=>r.finalProjectReport);
  const workReports=usable.filter(r=>!r.finalProjectReport);
  const hiddenCount=state.reports.length-usable.length;

  const finalHtml=finalReports.length
    ? finalReports.map(r=>{
        const project=state.projects.find(p=>p.id===r.projectId);
        return `<article class="report-full executive-report">
          <div class="executive-kicker">📨 CEO FINAL REPORT</div>
          <h3>${escapeHtml(project?.name||r.task)}</h3>
          <div class="report-meta">팀장 ${escapeHtml(r.employeeName)} · ${new Date(r.createdAt).toLocaleString()}</div>
          <div class="executive-body">${formatExecutiveReport(r.result)}</div>
        </article>`;
      }).join('')
    : '<div class="empty">아직 완성된 프로젝트 최종 보고서가 없습니다.</div>';

  const workHtml=workReports.length
    ? `<details class="work-report-group"><summary>직원 중간 보고 ${workReports.length}건 보기</summary><div class="work-report-list">${workReports.map(r=>`
        <article class="report-full work-report">
          <h3>${escapeHtml(r.employeeName)} · ${escapeHtml(r.department)}</h3>
          <div class="report-meta">${providerLabel[r.provider]||r.provider} · ${new Date(r.createdAt).toLocaleString()}</div>
          <p><b>업무:</b> ${escapeHtml(r.task)}</p>
          <pre>${escapeHtml(r.result)}</pre>
        </article>`).join('')}</div></details>`
    : '';

  wrap.innerHTML=`
    <div class="reports-section-title"><h3>CEO 최종 보고</h3><span>${finalReports.length}건</span></div>
    ${finalHtml}
    ${workHtml}
    ${hiddenCount? `<div class="report-quality-note">⚠ 프롬프트 오인식·미완성 응답 ${hiddenCount}건은 보고서에서 자동 제외했습니다.</div>`:''}
  `;
}

async function refreshSessions(){
  for(const provider of ['chatgpt','claude','gemini']) state.sessionInfo[provider]=await window.aiOffice.getSessionInfo(provider);
  renderSubscriptionCards(false);
}

function renderSubscriptionCards(refresh=true){
  const wrap=$('#subscriptionCards'); if(!wrap) return;
  const providers=[['chatgpt','ChatGPT','기존 ChatGPT 구독 계정'],['claude','Claude','기존 Claude 구독 계정'],['gemini','Gemini','기존 Gemini / Google AI 구독 계정']];
  wrap.innerHTML=providers.map(([id,name,desc])=>{
    const info=state.sessionInfo[id]; const has=info?.hasSessionData;
    return `<div class="card subscription-card"><div class="sub-head"><div><div class="sub-logo">${providerIcon[id]}</div><h2>${name}</h2><p>${desc}</p></div><span class="connection ${has?'on':''}">${has?'● 세션 데이터 있음':'○ 연결 필요'}</span></div><div class="sub-actions"><button class="btn primary connect-sub" data-provider="${id}">${has?'구독 창 열기':'연결 / 로그인'}</button><button class="btn ghost clear-sub" data-provider="${id}">세션 초기화</button></div><p class="tiny">로그인 여부를 AI OFFICE가 강제로 판독하지 않습니다. 서비스 창에서 로그인 상태를 직접 확인하세요.</p></div>`;
  }).join('');
  $$('.connect-sub').forEach(b=>b.onclick=async()=>{await openProvider(b.dataset.provider); setTimeout(refreshSessions,1200)});
  $$('.clear-sub').forEach(b=>b.onclick=async()=>{if(confirm('이 서비스의 AI OFFICE 전용 로그인 세션을 초기화할까요?')){await window.aiOffice.clearSubscriptionSession(b.dataset.provider);await refreshSessions();}});
  if(refresh && Object.keys(state.sessionInfo).length===0) refreshSessions();
}

function openEmployeeModal(id=null){
  state.editingId=id; const e=state.employees.find(x=>x.id===id);
  $('#modalTitle').textContent=e?'직원 정보 수정':'새 직원 채용';$('#saveEmployee').textContent=e?'저장하기':'채용하기';
  $('#empName').value=e?.name||'';$('#empRank').value=e?.rank||'사원';$('#empDept').value=e?.department||'';$('#empProvider').value=e?.provider||'chatgpt';$('#empRole').value=e?.role||'';$('#empTraits').value=e?.traits||'';
  $('#employeeModal').classList.remove('hidden');
}
function closeEmployeeModal(){ $('#employeeModal').classList.add('hidden'); state.editingId=null; }

function saveEmployee(){
  const name=$('#empName').value.trim(); if(!name){alert('직원 이름을 입력하세요.');return}
  const data={name,rank:$('#empRank').value,department:$('#empDept').value.trim()||'미지정',provider:$('#empProvider').value,role:$('#empRole').value.trim()||'일반 업무',traits:$('#empTraits').value.trim(),avatar:['🧑‍💼','👩‍💼','👨‍💼'][state.employees.length%3]};
  if(state.editingId){const i=state.employees.findIndex(e=>e.id===state.editingId);state.employees[i]={...state.employees[i],...data}}else state.employees.push({id:uid(),...data});
  persist();closeEmployeeModal();renderAll();
}

async function runTasks(){
  const task=$('#taskInput').value.trim(); if(!task){alert('업무 내용을 입력하세요.');return}
  const ids=$$('#assigneeList input:checked').map(x=>x.value); if(!ids.length){alert('업무를 맡길 직원을 선택하세요.');return}
  for(const id of ids){
    const e=state.employees.find(x=>x.id===id);
    if(e.provider==='demo'){
      const t={id:uid(),employeeId:e.id,employeeName:e.name,department:e.department,provider:e.provider,task,status:'done',startedAt:Date.now(),finishedAt:Date.now()};state.tasks.unshift(t);
      state.reports.unshift({id:uid(),employeeId:e.id,employeeName:e.name,department:e.department,provider:e.provider,task,result:`[DEMO] ${e.role} 담당 직원이 업무를 접수했습니다.\n\n실제 구독 AI 직원으로 변경하면 해당 서비스 창에서 업무를 수행할 수 있습니다.`,createdAt:Date.now()});
    } else {
      state.tasks.unshift({id:uid(),employeeId:e.id,employeeName:e.name,department:e.department,provider:e.provider,task,prompt:buildPrompt(e,task),status:'queued',startedAt:Date.now()});
    }
  }
  persist();renderAll();switchView('tasks');
}

async function openProvider(provider, prompt=''){
  if(provider==='demo') return;
  const r=await window.aiOffice.openSubscription(provider,prompt); if(!r.ok) alert(r.error||'AI 창을 열지 못했습니다.');
}
async function openTaskInProvider(id){
  const t=state.tasks.find(x=>x.id===id); if(!t) return;
  await openProvider(t.provider,t.prompt||'');
  t.status='opened';t.openedAt=Date.now();persist();renderAll();
}
async function copyTaskPrompt(id){
  const t=state.tasks.find(x=>x.id===id); if(!t) return;
  await window.aiOffice.copyText(t.prompt||''); alert('업무 프롬프트를 클립보드에 복사했습니다.');
}

function openResultModal(id){
  const t=state.tasks.find(x=>x.id===id); if(!t) return;
  state.resultTaskId=id; $('#resultTaskSummary').textContent=`${t.employeeName} · ${providerLabel[t.provider]} · ${t.task}`; $('#resultText').value=''; $('#resultModal').classList.remove('hidden');
}
function closeResultModal(){state.resultTaskId=null;$('#resultModal').classList.add('hidden');}
function saveResult(){
  const t=state.tasks.find(x=>x.id===state.resultTaskId); if(!t) return;
  const result=$('#resultText').value.trim(); if(!result){alert('AI 결과를 붙여넣으세요.');return}
  t.status='done';t.finishedAt=Date.now();
  const report={id:uid(),employeeId:t.employeeId,employeeName:t.employeeName,department:t.department,provider:t.provider,task:t.task,taskId:t.id,projectId:t.projectId||null,result,createdAt:Date.now()};
  state.reports.unshift(report);
  persist();closeResultModal();renderAll();
  window.dispatchEvent(new CustomEvent('ai-office-task-completed', { detail:{ taskId:t.id, reportId:report.id } }));
}

function switchView(name){
  $$('.view').forEach(v=>v.classList.remove('active')); $$('.nav').forEach(n=>n.classList.remove('active'));
  $(`#${name}View`).classList.add('active'); $(`.nav[data-view="${name}"]`)?.classList.add('active');
  const titles={office:['대표실','구독 중인 AI 직원들에게 업무를 지시하세요.'],employees:['직원 관리','직원마다 ChatGPT, Claude, Gemini 구독을 배정합니다.'],tasks:['업무 보드','구독 AI 작업 큐와 결과를 관리합니다.'],reports:['CEO 보고함','직원들의 완료 보고를 확인합니다.'],settings:['구독 연결','기존 AI 구독 계정을 AI OFFICE 전용 세션으로 연결합니다.']};
  $('#viewTitle').textContent=titles[name][0];$('#viewSubtitle').textContent=titles[name][1];
  if(name==='settings') refreshSessions();
}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

$$('.nav').forEach(n=>n.onclick=()=>switchView(n.dataset.view));
$('#newEmployeeTop').onclick=()=>openEmployeeModal();$('#newEmployeeBtn').onclick=()=>openEmployeeModal();$('#closeModal').onclick=closeEmployeeModal;$('#cancelEmployee').onclick=closeEmployeeModal;$('#saveEmployee').onclick=saveEmployee;
$('#selectAllBtn').onclick=()=>{$$('#assigneeList input').forEach(x=>x.checked=true)};$('#runTaskBtn').onclick=runTasks;$('#goReports').onclick=()=>switchView('reports');
$('#clearReports').onclick=()=>{if(confirm('보고함을 비울까요?')){state.reports=[];persist();renderAll()}};
$('#employeeModal').onclick=(e)=>{if(e.target.id==='employeeModal')closeEmployeeModal()};
$('#closeResultModal').onclick=closeResultModal;$('#cancelResult').onclick=closeResultModal;$('#saveResult').onclick=saveResult;$('#resultModal').onclick=(e)=>{if(e.target.id==='resultModal')closeResultModal()};
persist();renderAll();


const updateButton = $('#updateAppBtn');
if (updateButton) {
  updateButton.onclick = async () => {
    if (!confirm('GitHub에서 최신 버전을 받고 AI OFFICE를 재시작할까요?')) return;

    const originalText = updateButton.textContent;
    updateButton.disabled = true;
    updateButton.textContent = '⏳ 업데이트 중...';

    try {
      const result = await window.aiOffice.runUpdater();
      if (!result?.ok) {
        alert(result?.error || '업데이트를 실행하지 못했습니다.');
        updateButton.disabled = false;
        updateButton.textContent = originalText;
        return;
      }
      updateButton.textContent = '✅ 재시작 중...';
    } catch (error) {
      alert('업데이트 요청 중 오류가 발생했습니다.\n\n' + (error?.message || String(error)));
      updateButton.disabled = false;
      updateButton.textContent = originalText;
    }
  };
}
