(() => {
  const officeView = document.querySelector('#officeView');
  if (!officeView) return;

  const companyUI = {
    selectedEmployeeId: null,
    tick: null,
    dialogSignature: '',
    openReportId: null,
    layoutEdit: false,
    selectedFurnitureId: null,
  };

  const furnitureCatalog = {
    'ceo-desk':{label:'CEO 책상',col:0,row:0,w:27,h:22},
    'desk-1p':{label:'1인 책상',col:1,row:0,w:17,h:17},
    'desk-2p':{label:'2인 책상',col:2,row:0,w:24,h:18},
    'workstation-4p':{label:'4인 워크스테이션',col:0,row:1,w:25,h:21},
    'meeting-table':{label:'회의 테이블',col:1,row:1,w:24,h:18},
    'bookshelf':{label:'책장',col:2,row:1,w:16,h:22},
    'server-rack':{label:'서버 랙',col:0,row:2,w:15,h:23},
    'office-corner':{label:'정수기/서류함',col:1,row:2,w:14,h:20},
    'plant-large':{label:'대형 화분',col:2,row:2,w:10,h:18},
  };
  const defaultFurniture = [
    {id:'ceo',type:'ceo-desk',x:5,y:5,...furnitureCatalog['ceo-desk']},
    {id:'meet',type:'meeting-table',x:41,y:7,...furnitureCatalog['meeting-table']},
    {id:'server',type:'server-rack',x:82,y:6,...furnitureCatalog['server-rack']},
    {id:'ws-a',type:'workstation-4p',x:8,y:39,...furnitureCatalog['workstation-4p']},
    {id:'ws-b',type:'desk-2p',x:36,y:40,...furnitureCatalog['desk-2p']},
    {id:'ws-c',type:'desk-1p',x:10,y:68,...furnitureCatalog['desk-1p']},
    {id:'ws-d',type:'workstation-4p',x:37,y:66,...furnitureCatalog['workstation-4p']},
    {id:'shelf',type:'bookshelf',x:69,y:39,...furnitureCatalog['bookshelf']},
    {id:'corner',type:'office-corner',x:82,y:59,...furnitureCatalog['office-corner']},
    {id:'plant-a',type:'plant-large',x:61,y:44,...furnitureCatalog['plant-large']},
    {id:'plant-b',type:'plant-large',x:76,y:72,...furnitureCatalog['plant-large']},
  ];
  const loadFurniture=()=>{try{
    const saved=JSON.parse(localStorage.getItem('aiOfficeFurnitureV3'));
    return Array.isArray(saved)&&saved.every(x=>furnitureCatalog[x.type])?saved:defaultFurniture.map(x=>({...x}));
  }catch{return defaultFurniture.map(x=>({...x}))}};
  let furniture=loadFurniture();
  const saveFurniture=()=>localStorage.setItem('aiOfficeFurnitureV3',JSON.stringify(furniture));

  const loadCeoProfile=()=>{try{
    const saved=JSON.parse(localStorage.getItem('aiOfficeCeoProfileV1'));
    return saved && typeof saved==='object' ? saved : {name:'대표',spriteStyle:'leader'};
  }catch{return {name:'대표',spriteStyle:'leader'}}};
  let ceoProfile=loadCeoProfile();
  const saveCeoProfile=()=>localStorage.setItem('aiOfficeCeoProfileV1',JSON.stringify(ceoProfile));

  function ceoAsEmployee(){
    return {
      id:'__ceo__',
      name:ceoProfile.name||'대표',
      rank:'CEO',
      department:'대표실',
      role:'CEO',
      spriteStyle:ceoProfile.spriteStyle||'leader'
    };
  }

  const loadSeatAssignments=()=>{
    try{
      const saved=JSON.parse(localStorage.getItem('aiOfficeSeatAssignmentsV2'));
      return saved && typeof saved==='object' ? saved : {};
    }catch{return {}}
  };
  let seatAssignments=loadSeatAssignments();
  const saveSeatAssignments=()=>localStorage.setItem('aiOfficeSeatAssignmentsV2',JSON.stringify(seatAssignments));

  const seatOwnerByKey=(seatKey)=>{
    const entry=Object.entries(seatAssignments).find(([,key])=>key===seatKey);
    return entry ? entry[0] : null;
  };

  const nearestSeatOnDesk=(employeeId,furnitureId,clientX,clientY)=>{
    const office=document.querySelector('.game-office');
    const item=furniture.find(f=>f.id===furnitureId);
    if(!office||!item) return null;
    const rect=office.getBoundingClientRect();
    const px=(clientX-rect.left)/rect.width*100;
    const py=(clientY-rect.top)/rect.height*100;
    const seats=allWorkSeats().filter(s=>s.furnitureId===furnitureId);
    if(!seats.length) return null;

    const usedByOthers=new Set(
      Object.entries(seatAssignments)
        .filter(([id])=>id!==employeeId)
        .map(([,key])=>key)
    );
    const free=seats.filter(s=>!usedByOthers.has(s.key));
    const pool=free.length?free:seats;
    return pool.sort((a,b)=>{
      const da=(a.point[0]-px)**2+(a.point[1]-py)**2;
      const db=(b.point[0]-px)**2+(b.point[1]-py)**2;
      return da-db;
    })[0]||null;
  };

  const assignSeatExplicit=(employeeId,seatKey)=>{
    const employee=state.employees.find(e=>e.id===employeeId);
    if(!employee) return false;
    const seat=allWorkSeats().find(s=>s.key===seatKey);
    if(!seat) return false;
    const otherOwner=seatOwnerByKey(seatKey);
    if(otherOwner && otherOwner!==employeeId) delete seatAssignments[otherOwner];
    seatAssignments[employeeId]=seatKey;
    saveSeatAssignments();
    reconcileSeatAssignments();
    refreshEmployeeDestinations();
    return true;
  };

  const refreshEmployeeDestinations=()=>{
    if(document.querySelector('#simEmployees')) {
      renderCompanyOffice();
      companyUI.dialogSignature='';
      renderEmployeeDialog();
    }
  };

  const rolePalette = (employee) => {
    const style = employee.spriteStyle || 'auto';
    const s = `${employee.department || ''} ${employee.role || ''}`.toLowerCase();
    if (style === 'marketing' || (style === 'auto' && /마케팅|콘텐츠/.test(s))) return { main:'#f65ca8', dark:'#8f285f', accent:'#ffd2e8' };
    if (style === 'development' || (style === 'auto' && /개발|엔지니어|코드/.test(s))) return { main:'#58a6ff', dark:'#245c9a', accent:'#d3e8ff' };
    if (style === 'design' || (style === 'auto' && /디자인/.test(s))) return { main:'#a875ff', dark:'#5938a0', accent:'#eadcff' };
    if (style === 'qa' || (style === 'auto' && /qa|검수|품질/.test(s))) return { main:'#54d39a', dark:'#237a58', accent:'#d6f8e9' };
    if (style === 'analysis' || (style === 'auto' && /분석|데이터|리서치/.test(s))) return { main:'#44d77b', dark:'#237044', accent:'#d8ffe5' };
    if (style === 'leader' || (style === 'auto' && /팀장|대표|ceo/.test(`${employee.rank || ''} ${employee.role || ''}`.toLowerCase()))) return { main:'#f3b64e', dark:'#9a651a', accent:'#fff0c6' };
    if (style === 'planning') return { main:'#7c8cff', dark:'#4050a6', accent:'#dfe3ff' };
    return { main:'#7c8cff', dark:'#4050a6', accent:'#dfe3ff' };
  };

  function pixelAvatar(employee, status='idle', large=false) {
    const resolvedStyle = employeeRoleType(employee);
    const frameState =
      ['moving','moving-report','moving-meeting','moving-ceo','returning'].includes(status) ? 'moving' :
      status === 'working' ? 'working' :
      status === 'meeting' ? 'meeting' :
      ['reporting','ceo-report'].includes(status) ? 'reporting' :
      status === 'done' ? 'done' : 'idle';
    return `<div class="asset-pixel-avatar role-${resolvedStyle} state-${frameState} ${large?'large':''}">
      <span class="asset-sprite"></span>
    </div>`;
  }


  function hashCode(str='') {
    let h=0; for(let i=0;i<str.length;i++) h=((h<<5)-h)+str.charCodeAt(i)|0; return h;
  }

  function activeTask(employeeId) {
    return state.tasks.find(t => t.employeeId === employeeId && ['queued','working','opened'].includes(t.status));
  }

  function recentDoneTask(employeeId) {
    return state.tasks.find(t => t.employeeId === employeeId && t.status === 'done' && Date.now() - (t.finishedAt || 0) < 18000);
  }

  function employeeVisualState(employee) {
    const task = activeTask(employee.id);
    const done = recentDoneTask(employee.id);

    if (done) {
      const elapsed = Date.now() - (done.finishedAt || Date.now());

      if (done.taskType === 'project-final') {
        if (elapsed < 3500) return 'moving-ceo';
        if (elapsed < 9000) return 'ceo-report';
        if (elapsed < 12500) return 'returning';
        return 'done';
      }

      if (elapsed < 3500) return 'moving-report';
      if (elapsed < 8500) return 'reporting';
      if (elapsed < 12000) return 'returning';
      return 'done';
    }

    if (!task) return 'idle';
    if (task.status === 'opened' && task.automationError) return 'blocked';

    const startedAt = task.automationStartedAt || task.startedAt || task.createdAt || Date.now();
    const elapsed = Date.now() - startedAt;
    const project = task.projectId ? state.projects.find(p => p.id === task.projectId) : null;
    const coworkers = project ? project.taskIds
      .map(id => state.tasks.find(t => t.id === id))
      .filter(t => t && ['queued','working','opened'].includes(t.status)).length : 0;

    if (task.taskType === 'project-final') {
      if (elapsed < 3000) return 'moving';
      return task.status === 'working' ? 'working' : 'moving';
    }

    if (task.status === 'queued') return 'moving';
    if (elapsed < 3000) return 'moving';

    if (project && coworkers >= 2) {
      if (elapsed >= 7000 && elapsed < 12500) return 'moving-meeting';
      if (elapsed >= 12500 && elapsed < 19000) return 'meeting';
      if (elapsed >= 19000 && elapsed < 22500) return 'returning';
    }

    return task.status === 'working' ? 'working' : 'moving';
  }

  const statusMeta = {
    idle: ['자리 비움','휴식/대기','○'],
    moving: ['자리로 이동 중','업무 자리로 이동','🚶'],
    working: ['근무 중','업무 수행 중','●'],
    'moving-meeting': ['회의실 이동 중','회의실로 이동','🚶'],
    meeting: ['회의 중','프로젝트 회의','👥'],
    returning: ['자리 복귀 중','자기 자리로 복귀','↩'],
    'moving-report': ['보고 이동 중','팀장에게 보고하러 이동','🚶'],
    reporting: ['보고 중','팀장에게 결과 보고','📨'],
    'moving-ceo': ['CEO실 이동 중','CEO에게 최종 보고하러 이동','🚶'],
    'ceo-report': ['최종 보고 중','CEO에게 최종 보고','👑'],
    done: ['업무 완료','업무 완료','✓'],
    blocked: ['확인 필요','자동화 확인 필요','!'],
  };

  function buildCompanyShell() {
    officeView.innerHTML = `
      <div class="company-toolbar card game-toolbar">
        <div>
          <div class="company-kicker">🏢 MY AI COMPANY</div>
          <h2>AI 직원들과 함께 일하는 회사</h2>
          <p>직원들이 실제 사무실에서 움직이고, 회의하고, 보고하는 모습을 확인하세요.</p>
        </div>
        <div class="company-toolbar-actions">
          <button id="ceoSettingsBtn" class="btn ghost ceo-settings-btn">👑 대표 설정</button>
          <div id="companyStats" class="company-stats"></div>
        </div>
      </div>

      <div class="company-layout game-company-layout">
        <section class="sim-office card game-office">
          <div class="editable-office-floor"></div>
          <div id="officeFurniture" class="office-furniture"></div>
          <div class="layout-editor-bar">
            <button id="layoutEditBtn" class="layout-edit-btn">✥ 배치 편집</button>
            <div id="layoutTools" class="layout-tools">
              <div class="layout-help"><b>배치 편집</b><span id="selectedFurnitureLabel">가구를 클릭해서 선택하고 드래그하세요.</span></div>

              <div class="layout-add-group">
                <button data-add="desk-1p">+ 1인 책상</button><button data-add="desk-2p">+ 2인 책상</button><button data-add="workstation-4p">+ 4인 책상</button><button data-add="meeting-table">+ 회의 테이블</button><button data-add="bookshelf">+ 책장</button><button data-add="server-rack">+ 서버랙</button><button data-add="office-corner">+ 정수기</button><button data-add="plant-large">+ 화분</button>
              </div>
              <div class="layout-action-group"><button id="layoutDeleteBtn">선택 삭제</button><button id="layoutResetBtn">초기화</button><button id="layoutDoneBtn" class="primary">완료</button></div>
            </div>
          </div>

          <div id="simEmployees" class="sim-employees"></div>
          <div id="employeeDialogHost" class="employee-dialog-host"></div>
          <div id="officeActivity" class="office-activity game-activity"></div>
        </section>

        <aside class="ceo-directive-panel card game-command-panel">
          <div class="ceo-directive-header">
            <div class="ceo-crown">⚡</div>
            <div>
              <div class="company-kicker">CEO QUICK COMMAND</div>
              <h2>빠른 업무 지시</h2>
              <p>오피스를 보면서 필요한 직원에게 즉시 업무를 배정하세요.</p>
            </div>
          </div>

          <div class="command-step">
            <span class="command-step-no">1</span>
            <div><b>업무 내용</b><small>해야 할 일을 구체적으로 입력하세요.</small></div>
          </div>
          <textarea id="taskInput" placeholder="예: 신규 고객 유치를 위한 실행 가능한 마케팅 전략을 만들어줘."></textarea>

          <div class="command-step">
            <span class="command-step-no">2</span>
            <div><b>담당 직원 선택</b><small>업무를 맡길 AI 직원을 선택하세요.</small></div>
          </div>
          <div id="assigneeList" class="assignee-list ceo-assignees"></div>

          <div class="ceo-directive-options">
            <label class="quick-auto"><input id="autoRunToggle" type="checkbox" checked> 배정 즉시 자동 실행</label>
          </div>

          <div class="ceo-directive-actions">
            <button id="selectAllBtnCompany" class="btn ghost">전체 선택</button>
            <button id="runTaskBtnCompany" class="btn primary">✈ 업무 지시하기</button>
          </div>

          <div class="recent-command-box">
            <div class="recent-command-head"><b>최근 지시한 업무</b><span>LIVE</span></div>
            <div id="recentCommandList" class="recent-command-list"></div>
          </div>
        </aside>
      </div>

      <div id="ceoProfileModal" class="modal hidden">
        <div class="modal-card ceo-profile-modal-card">
          <div class="modal-head"><h2>대표 캐릭터 설정</h2><button id="closeCeoProfile" class="icon-btn">✕</button></div>
          <div class="form-grid">
            <label>대표 이름<input id="ceoProfileName" value="${escapeHtml(ceoProfile.name||'대표')}" /></label>
            <label>캐릭터 스타일
              <select id="ceoProfileSprite">
                <option value="leader">리더 / CEO</option>
                <option value="planning">기획</option>
                <option value="marketing">마케팅</option>
                <option value="development">개발</option>
                <option value="design">디자인</option>
                <option value="analysis">분석</option>
                <option value="qa">QA</option>
              </select>
            </label>
          </div>
          <div class="modal-actions">
            <button id="cancelCeoProfile" class="btn ghost">취소</button>
            <button id="saveCeoProfileBtn" class="btn primary">저장</button>
          </div>
        </div>
      </div>
    `;

    renderFurniture();
    renderCeoCharacter();

    const ceoModal=document.querySelector('#ceoProfileModal');
    const ceoOpen=document.querySelector('#ceoSettingsBtn');
    const ceoName=document.querySelector('#ceoProfileName');
    const ceoSprite=document.querySelector('#ceoProfileSprite');
    const closeCeo=()=>ceoModal?.classList.add('hidden');
    if(ceoSprite) ceoSprite.value=ceoProfile.spriteStyle||'leader';
    ceoOpen?.addEventListener('click',()=>{
      if(ceoName) ceoName.value=ceoProfile.name||'대표';
      if(ceoSprite) ceoSprite.value=ceoProfile.spriteStyle||'leader';
      ceoModal?.classList.remove('hidden');
    });
    document.querySelector('#closeCeoProfile')?.addEventListener('click',closeCeo);
    document.querySelector('#cancelCeoProfile')?.addEventListener('click',closeCeo);
    document.querySelector('#saveCeoProfileBtn')?.addEventListener('click',()=>{
      ceoProfile={
        name:(ceoName?.value||'대표').trim()||'대표',
        spriteStyle:ceoSprite?.value||'leader'
      };
      saveCeoProfile();
      renderCeoCharacter();
      closeCeo();
    });

    const editBtn=document.querySelector('#layoutEditBtn'), tools=document.querySelector('#layoutTools'), office=document.querySelector('.game-office');
    const refreshSelectedFurnitureLabel=()=>{
      const label=document.querySelector('#selectedFurnitureLabel');
      const selected=furniture.find(x=>x.id===companyUI.selectedFurnitureId);
      if(label) label.textContent=selected ? `${furnitureCatalog[selected.type]?.label||selected.type} 선택됨 · 드래그해서 이동` : '가구를 클릭해서 선택하고 드래그하세요.';
    };
    const enterLayoutEdit=()=>{
      companyUI.layoutEdit=true;
      office?.classList.add('layout-editing');
      tools?.classList.add('show');
      if(editBtn) editBtn.style.display='none';
      renderFurniture();
      refreshSelectedFurnitureLabel();
    };
    const leaveLayoutEdit=()=>{
      companyUI.layoutEdit=false;
      companyUI.selectedFurnitureId=null;
      office?.classList.remove('layout-editing');
      tools?.classList.remove('show');
      if(editBtn) editBtn.style.display='';
      saveFurniture();
      renderFurniture();
      refreshEmployeeDestinations();
    };
    editBtn?.addEventListener('click',(ev)=>{ev.stopPropagation();enterLayoutEdit()});
    document.querySelector('#layoutDoneBtn')?.addEventListener('click',(ev)=>{ev.stopPropagation();leaveLayoutEdit()});
    tools?.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',(ev)=>{
      ev.stopPropagation();
      const type=btn.dataset.add,preset=furnitureCatalog[type]; if(!preset)return;
      const item={id:'f-'+Date.now(),type,x:42,y:48,...preset};
      furniture.push(item); companyUI.selectedFurnitureId=item.id; saveFurniture(); cleanSeatAssignments(); renderFurniture(); refreshSelectedFurnitureLabel(); refreshEmployeeDestinations();
    }));
    document.querySelector('#layoutDeleteBtn')?.addEventListener('click',(ev)=>{
      ev.stopPropagation(); if(!companyUI.selectedFurnitureId)return;
      furniture=furniture.filter(x=>x.id!==companyUI.selectedFurnitureId); companyUI.selectedFurnitureId=null; saveFurniture(); cleanSeatAssignments(); renderFurniture(); refreshSelectedFurnitureLabel(); refreshEmployeeDestinations();
    });
    document.querySelector('#layoutResetBtn')?.addEventListener('click',(ev)=>{
      ev.stopPropagation(); furniture=defaultFurniture.map(x=>({...x})); companyUI.selectedFurnitureId=null; seatAssignments={}; saveSeatAssignments(); saveFurniture(); renderFurniture(); refreshSelectedFurnitureLabel(); refreshEmployeeDestinations();
    });
    office?.addEventListener('pointerdown',(ev)=>{
      if(!companyUI.layoutEdit) return;
      if(ev.target.closest('.office-item,.layout-editor-bar')) return;
      companyUI.selectedFurnitureId=null; renderFurniture(); refreshSelectedFurnitureLabel();
    });
    const deleteSelected=(ev)=>{
      if(!companyUI.layoutEdit || !['Delete','Backspace'].includes(ev.key) || !companyUI.selectedFurnitureId) return;
      ev.preventDefault(); furniture=furniture.filter(x=>x.id!==companyUI.selectedFurnitureId); companyUI.selectedFurnitureId=null; saveFurniture(); renderFurniture(); refreshSelectedFurnitureLabel();
    };
    window.addEventListener('keydown',deleteSelected,{once:false});

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


  function renderFurniture(){
    const host=document.querySelector('#officeFurniture'); if(!host)return;
    host.innerHTML=furniture.map(item=>{
      const preset=furnitureCatalog[item.type]||item;
      const isDesk=['desk-1p','desk-2p','workstation-4p'].includes(item.type);
      const isDepthDesk=isDesk||item.type==='ceo-desk';
      const pins='';
      return `<button type="button" class="office-item pixel-furniture ${isDepthDesk?'depth-desk':''} ${item.type==='ceo-desk'?'ceo-depth-desk':''} ${companyUI.selectedFurnitureId===item.id?'selected':''}" data-id="${item.id}" aria-label="${preset.label||item.type}" style="left:${item.x}%;top:${item.y}%;width:${item.w}%;height:${item.h}%">
        <img class="furniture-sprite real-furniture-image furniture-base-image" src="assets/furniture/${item.type}.png" alt="" draggable="false">
        ${isDepthDesk ? '<img class="furniture-sprite real-furniture-image furniture-front-image" src="assets/furniture/'+item.type+'.png" alt="" draggable="false">' : ''}
        ${pins}
        <em>${preset.label||item.label||item.type}</em>
      </button>`;
    }).join('');

    const updateLabel=()=>{
      const label=document.querySelector('#selectedFurnitureLabel');
      const selected=furniture.find(x=>x.id===companyUI.selectedFurnitureId);
      if(label) label.textContent=selected ? `${furnitureCatalog[selected.type]?.label||selected.type} 선택됨 · 드래그해서 이동` : '가구를 클릭해서 선택하고 드래그하세요.';
    };

    host.querySelectorAll('.office-item').forEach(el=>{
      el.addEventListener('click',(ev)=>{
        if(!companyUI.layoutEdit)return;
        ev.preventDefault(); ev.stopPropagation();
        companyUI.selectedFurnitureId=el.dataset.id;
        host.querySelectorAll('.office-item').forEach(x=>x.classList.toggle('selected',x===el));
        updateLabel();
      });

      el.addEventListener('pointerdown',(ev)=>{
        if(!companyUI.layoutEdit)return;
        ev.preventDefault(); ev.stopPropagation();
        const item=furniture.find(x=>x.id===el.dataset.id); if(!item)return;
        companyUI.selectedFurnitureId=item.id;
        host.querySelectorAll('.office-item').forEach(x=>x.classList.toggle('selected',x===el));
        updateLabel();

        const office=document.querySelector('.game-office');
        const rect=office.getBoundingClientRect();
        const startX=ev.clientX, startY=ev.clientY, originX=item.x, originY=item.y;
        const pointerId=ev.pointerId;
        el.classList.add('dragging');
        try{el.setPointerCapture(pointerId)}catch{}

        const move=(e)=>{
          if(e.pointerId!==pointerId)return;
          const dx=(e.clientX-startX)/rect.width*100;
          const dy=(e.clientY-startY)/rect.height*100;
          item.x=Math.max(0,Math.min(100-item.w,originX+dx));
          item.y=Math.max(0,Math.min(100-item.h,originY+dy));
          el.style.left=item.x+'%'; el.style.top=item.y+'%';
          if(item.type==='ceo-desk') renderCeoCharacter();
        };
        const up=(e)=>{
          if(e.pointerId!==pointerId)return;
          try{el.releasePointerCapture(pointerId)}catch{}
          el.classList.remove('dragging');
          el.removeEventListener('pointermove',move);
          el.removeEventListener('pointerup',up);
          el.removeEventListener('pointercancel',up);
          saveFurniture(); updateLabel(); refreshEmployeeDestinations();
        };
        el.addEventListener('pointermove',move);
        el.addEventListener('pointerup',up);
        el.addEventListener('pointercancel',up);
      });
    });
  }


  function employeeRoleType(employee) {
    const style=employee.spriteStyle||'auto';
    if(style!=='auto') return style;
    const combined=`${employee.department||''} ${employee.role||''}`.toLowerCase();
    if(/마케팅|콘텐츠/.test(combined)) return 'marketing';
    if(/개발|엔지니어|코드/.test(combined)) return 'development';
    if(/디자인/.test(combined)) return 'design';
    if(/분석|데이터|리서치/.test(combined)) return 'analysis';
    if(/qa|검수|품질/.test(combined)) return 'qa';
    if(/팀장|대표|ceo/.test(`${employee.rank||''} ${employee.role||''}`.toLowerCase())) return 'leader';
    return 'planning';
  }

  function clampOfficePoint([x,y]) {
    const activitySafeBottom=82;
    return [Math.max(3,Math.min(97,x)),Math.max(8,Math.min(activitySafeBottom,y))];
  }

  function furnitureByType(type) {
    return furniture.filter(item=>item.type===type);
  }

  function deskSeatPoints(item) {
    const x=item.x,y=item.y,w=item.w,h=item.h;
    const spot=(rx,ry,facing='up')=>({point:clampOfficePoint([x+w*rx,y+h*ry]),facing});
    if(item.type==='desk-1p') return [
      spot(.50,.93,'up'),
    ];
    if(item.type==='desk-2p') return [
      spot(.28,.93,'up'),
      spot(.72,.93,'up'),
    ];
    if(item.type==='workstation-4p') return [
      spot(.24,.92,'up'),
      spot(.43,.92,'up'),
      spot(.62,.92,'up'),
      spot(.81,.92,'up'),
    ];
    return [];
  }

  function allWorkSeats() {
    const deskTypes=['desk-1p','desk-2p','workstation-4p'];
    const desks=furniture
      .filter(item=>deskTypes.includes(item.type))
      .sort((a,b)=>(a.y-b.y)||(a.x-b.x));

    const seatGroups=desks.map(item=>deskSeatPoints(item).map((seat,seatIndex)=>({
      ...seat,
      furnitureId:item.id,
      seatIndex,
      key:`${item.id}:${seatIndex}`
    })));

    const seats=[];
    const maxSeats=Math.max(0,...seatGroups.map(group=>group.length));
    for(let seatIndex=0;seatIndex<maxSeats;seatIndex++){
      seatGroups.forEach(group=>{
        if(group[seatIndex]) seats.push(group[seatIndex]);
      });
    }
    return seats;
  }

  function cleanSeatAssignments() {
    const validEmployeeIds=new Set(state.employees.map(e=>e.id));
    const validSeatKeys=new Set(allWorkSeats().map(s=>s.key));
    let changed=false;
    const seen=new Set();

    Object.keys(seatAssignments).forEach(employeeId=>{
      const seatKey=seatAssignments[employeeId];
      const invalid=!validEmployeeIds.has(employeeId)||!validSeatKeys.has(seatKey)||seen.has(seatKey);
      if(invalid){
        delete seatAssignments[employeeId];
        changed=true;
      }else{
        seen.add(seatKey);
      }
    });

    if(changed) saveSeatAssignments();
  }

  function reconcileSeatAssignments() {
    const seats=allWorkSeats();
    const employees=state.employees.slice(0,9);
    cleanSeatAssignments();
    if(!seats.length) return;

    const seatByKey=new Map(seats.map(s=>[s.key,s]));
    const used=new Set();

    employees.forEach(employee=>{
      const key=seatAssignments[employee.id];
      if(key && seatByKey.has(key) && !used.has(key)){
        used.add(key);
        return;
      }
      delete seatAssignments[employee.id];
    });

    employees.forEach(employee=>{
      if(seatAssignments[employee.id]) return;

      const occupiedFurniture=new Set(
        [...used].map(key=>String(key).split(':')[0])
      );

      const freeSeat=
        seats.find(s=>!used.has(s.key) && !occupiedFurniture.has(s.furnitureId)) ||
        seats.find(s=>!used.has(s.key));

      if(!freeSeat) return;
      seatAssignments[employee.id]=freeSeat.key;
      used.add(freeSeat.key);
    });

    saveSeatAssignments();
  }

  function assignSeatForEmployee(employee) {
    reconcileSeatAssignments();
    const seats=allWorkSeats();
    if(!seats.length) return null;
    const key=seatAssignments[employee.id];
    return seats.find(s=>s.key===key) || null;
  }

  function homeSeatForEmployee(employee,index) {
    const assigned=assignSeatForEmployee(employee);
    if(assigned) return assigned;
    return {point:[18+(index%3)*18,52+Math.floor(index/3)*18],facing:'up',key:`fallback:${index}`};
  }

  function meetingSeatForEmployee(employee,index) {
    const table=furnitureByType('meeting-table')[0];
    if(!table) return [58,20];
    const x=table.x,y=table.y,w=table.w,h=table.h;
    const points=[
      [x+w*.22,y+h*.92],[x+w*.50,y+h*.92],[x+w*.78,y+h*.92],
      [x+w*.20,y+h*.18],[x+w*.50,y+h*.18],[x+w*.80,y+h*.18],
    ].map(clampOfficePoint);
    return points[index%points.length];
  }

  function ceoDeskSeat() {
    const desk=furnitureByType('ceo-desk')[0];
    if(!desk) return {point:[22,18],facing:'down'};
    return {
      point:clampOfficePoint([desk.x+desk.w*.50,desk.y+desk.h*.47]),
      facing:'down',
      furnitureId:desk.id
    };
  }

  function ceoCharacterPoint() {
    return ceoDeskSeat().point;
  }

  function ceoReportPoint() {
    const desk=furnitureByType('ceo-desk')[0];
    if(!desk){
      const [x,y]=ceoCharacterPoint();
      return clampOfficePoint([x,y+10]);
    }
    return clampOfficePoint([desk.x+desk.w*.50,desk.y+desk.h*1.03]);
  }

  function managerReportPoint() {
    const leaderIndex=state.employees.findIndex(e=>employeeRoleType(e)==='leader');
    if(leaderIndex>=0){
      const leader=state.employees[leaderIndex];
      const seat=homeSeatForEmployee(leader,leaderIndex);
      const [x,y]=seat.point;
      return clampOfficePoint([x+4,y+1]);
    }
    const seats=allWorkSeats();
    return seats.length ? clampOfficePoint([seats[seats.length-1].point[0]+4,seats[seats.length-1].point[1]]) : [73,69];
  }

  function employeePlacement(employee,index,visualState) {
    const home=homeSeatForEmployee(employee,index);
    if(visualState==='moving-meeting'||visualState==='meeting') {
      return {point:meetingSeatForEmployee(employee,index),facing:'down',seated:false};
    }
    if(visualState==='reporting'||visualState==='moving-report') {
      return {point:managerReportPoint(),facing:'down',seated:false};
    }
    if(visualState==='moving-ceo'||visualState==='ceo-report') {
      return {point:ceoReportPoint(),facing:'down',seated:false};
    }
    return {point:home.point,facing:home.facing||'up',seated:false};
  }

  function employeePosition(employee,index,visualState) {
    return employeePlacement(employee,index,visualState).point;
  }


  function renderCompanyOffice() {
    if (!document.querySelector('#simEmployees')) buildCompanyShell();
    const wrap = document.querySelector('#simEmployees');
    if (!wrap) return;

    if (companyUI.selectedEmployeeId && !state.employees.some(e => e.id === companyUI.selectedEmployeeId)) {
      companyUI.selectedEmployeeId = null;
    }

    const visibleEmployees = [ceoAsEmployee(), ...state.employees.slice(0,9)];
    reconcileSeatAssignments();
    const liveIds = new Set(visibleEmployees.map(e => e.id));

    wrap.querySelectorAll('.sim-employee').forEach(el => {
      if (!liveIds.has(el.dataset.id)) el.remove();
    });

    visibleEmployees.forEach((employee,index) => {
      const isCeo = employee.id === '__ceo__';
      const vstate = isCeo ? 'idle' : employeeVisualState(employee);
      const placement = isCeo
        ? {point:ceoCharacterPoint(),facing:'down',seated:false}
        : employeePlacement(employee,index-1,vstate);
      const pos = placement.point;
      const meta = isCeo ? ['대표','CEO','👑'] : (statusMeta[vstate] || statusMeta.idle);
      const task = isCeo ? null : (activeTask(employee.id) || recentDoneTask(employee.id));
      const selected = !isCeo && companyUI.selectedEmployeeId === employee.id;

      let el = wrap.querySelector(`.sim-employee[data-id="${employee.id}"]`);
      if (!el) {
        el = document.createElement('button');
        el.className = 'sim-employee';
        el.dataset.id = employee.id;
        el.style.setProperty('--delay', `${index*70}ms`);
        el.innerHTML = `
          <div class="employee-status-bubble">
            <span class="status-dot-mini"></span>
            <b></b>
            <small></small>
          </div>
          <div class="employee-character"></div>
          <div class="employee-task-caption"></div>
        `;
        let suppressNextClick=false;

        el.onclick = (event) => {
          if(suppressNextClick){
            suppressNextClick=false;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if(companyUI.layoutEdit) return;
          event.stopPropagation();
          if(employee.id==='__ceo__'){
            document.querySelector('#ceoSettingsBtn')?.click();
            return;
          }
          companyUI.selectedEmployeeId = companyUI.selectedEmployeeId === el.dataset.id ? null : el.dataset.id;
          companyUI.openReportId = null;
          companyUI.dialogSignature = '';
          renderEmployeeDialog();
          updateSelectedEmployeeStyles();
        };

        el.addEventListener('pointerdown',(event)=>{
          if(companyUI.layoutEdit) return;
          if(event.button!==undefined && event.button!==0) return;

          const pointerId=event.pointerId;
          const office=document.querySelector('.game-office');
          if(!office) return;

          const officeRect=office.getBoundingClientRect();
          const startX=event.clientX,startY=event.clientY;
          const startLeft=parseFloat(el.style.getPropertyValue('--x'))||0;
          const startTop=parseFloat(el.style.getPropertyValue('--y'))||0;
          let dragging=false;

          const beginDrag=(e)=>{
            if(dragging) return;
            dragging=true;
            suppressNextClick=true;
            companyUI.selectedEmployeeId=null;
            companyUI.openReportId=null;
            companyUI.dialogSignature='';
            renderEmployeeDialog();
            el.classList.add('employee-dragging');
            try{el.setPointerCapture(pointerId)}catch{}
          };

          const move=(e)=>{
            if(e.pointerId!==pointerId) return;
            const pixelDistance=Math.hypot(e.clientX-startX,e.clientY-startY);
            if(!dragging && pixelDistance>=7) beginDrag(e);
            if(!dragging) return;

            e.preventDefault();
            const dx=(e.clientX-startX)/officeRect.width*100;
            const dy=(e.clientY-startY)/officeRect.height*100;
            const x=Math.max(3,Math.min(97,startLeft+dx));
            const y=Math.max(8,Math.min(82,startTop+dy));
            el.style.setProperty('--x',x+'%');
            el.style.setProperty('--y',y+'%');

            const targetSelector=employee.id==='__ceo__'
              ? '.office-item.ceo-depth-desk'
              : '.office-item.depth-desk:not(.ceo-depth-desk)';
            document.querySelectorAll(targetSelector).forEach(desk=>{
              const r=desk.getBoundingClientRect();
              const over=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
              desk.classList.toggle('employee-drop-target',over);
            });
          };

          const up=(e)=>{
            if(e.pointerId!==pointerId) return;
            try{el.releasePointerCapture(pointerId)}catch{}
            el.removeEventListener('pointermove',move);
            el.removeEventListener('pointerup',up);
            el.removeEventListener('pointercancel',up);

            if(!dragging) return;

            el.classList.remove('employee-dragging');
            let targetDesk=null;
            const targetSelector=employee.id==='__ceo__'
              ? '.office-item.ceo-depth-desk'
              : '.office-item.depth-desk:not(.ceo-depth-desk)';
            document.querySelectorAll(targetSelector).forEach(desk=>{
              const r=desk.getBoundingClientRect();
              const over=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
              desk.classList.remove('employee-drop-target');
              if(over) targetDesk=desk;
            });

            if(targetDesk && employee.id!=='__ceo__'){
              const seat=nearestSeatOnDesk(employee.id,targetDesk.dataset.id,e.clientX,e.clientY);
              if(seat) assignSeatExplicit(employee.id,seat.key);
            }
            refreshEmployeeDestinations();
          };

          el.addEventListener('pointermove',move);
          el.addEventListener('pointerup',up);
          el.addEventListener('pointercancel',up);
        });

        wrap.appendChild(el);
      }

      const previousState = el.dataset.visualState;
      el.dataset.visualState = vstate;
      el.className = `sim-employee ${isCeo?'ceo-employee':''} ${selected?'selected':''} sim-${vstate} ${placement.seated?'seat-seated':''} seat-facing-${placement.facing||'up'}`;
      el.dataset.seated = placement.seated ? '1' : '0';
      el.dataset.facing = placement.facing || 'up';
      const assignedSeat=isCeo ? null : seatAssignments[employee.id];
      if(assignedSeat) el.dataset.seatKey=assignedSeat;
      else delete el.dataset.seatKey;
      el.style.setProperty('--x', `${pos[0]}%`);
      el.style.setProperty('--y', `${pos[1]}%`);
      el.style.setProperty('--employee-depth', String(1000+Math.round(pos[1]*10)));

      const dot = el.querySelector('.status-dot-mini');
      dot.className = `status-dot-mini ${vstate}`;
      el.querySelector('.employee-status-bubble b').textContent = employee.name;
      el.querySelector('.employee-status-bubble small').textContent = isCeo ? 'CEO' : meta[0];
      el.querySelector('.employee-task-caption').textContent = isCeo ? '대표 자리' : (task?.task?.slice(0,30) || employee.role || '대기');

      const character = el.querySelector('.employee-character');
      const signature = `${employee.spriteStyle||'auto'}|${employee.department}|${employee.role}|${vstate}`;
      if (character.dataset.signature !== signature) {
        character.dataset.signature = signature;
        character.innerHTML = pixelAvatar(employee,vstate);
      }

      if (previousState && previousState !== vstate) {
        el.classList.add('state-changed');
        setTimeout(() => el.classList.remove('state-changed'), 450);
      }
    });

    const assignees=document.querySelector('#assigneeList');
    if(assignees){
      const checked = new Set([...assignees.querySelectorAll('input:checked')].map(x=>x.value));
      const currentIds = [...assignees.querySelectorAll('input')].map(x=>x.value).join('|');
      const nextIds = state.employees.map(e=>e.id).join('|');
      if(currentIds !== nextIds){
        assignees.innerHTML=state.employees.map(e=>`<label class="assignee"><input type="checkbox" value="${e.id}" ${checked.has(e.id)?'checked':''}><span>${e.avatar||'🧑‍💼'} ${escapeHtml(e.name)} · ${escapeHtml(e.role)}</span><span class="provider">${providerLabel[e.provider]||e.provider}</span></label>`).join('');
      }
    }
    updateSelectedEmployeeStyles();
    renderEmployeeDialog();
    renderStats();
    renderActivity();
    renderRecentCommands();
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

  function renderRecentCommands() {
    const wrap=document.querySelector('#recentCommandList');
    if(!wrap) return;
    const rows=state.tasks.slice(0,5);
    wrap.innerHTML=rows.length ? rows.map(t=>{
      const status=t.status==='done'?'완료':t.status==='working'?'진행 중':t.status==='opened'?'확인 필요':'대기';
      const cls=t.status==='done'?'done':t.status==='working'?'working':t.status==='opened'?'warn':'queued';
      return `<div class="recent-command-item">
        <span class="recent-command-dot ${cls}"></span>
        <div><b>${escapeHtml(t.task.slice(0,34))}</b><small>${escapeHtml(t.employeeName)} · ${status}</small></div>
      </div>`;
    }).join('') : '<div class="recent-command-empty">아직 지시한 업무가 없습니다.</div>';
  }

  function renderActivity() {
    const el=document.querySelector('#officeActivity'); if(!el) return;
    const rows = state.tasks.slice(0,4).map(t => {
      const label = t.status==='done'?'완료':t.status==='working'?'진행':'대기';
      return `<div><span>${new Date(t.finishedAt||t.startedAt||Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span><b>${escapeHtml(t.employeeName)}</b><em>${label}</em><small>${escapeHtml(t.task.slice(0,38))}</small></div>`;
    });
    el.innerHTML = `<h4>최근 활동</h4>${rows.join('') || '<p>아직 활동 기록이 없습니다.</p>'}`;
  }

  function updateSelectedEmployeeStyles() {
    document.querySelectorAll('.sim-employee').forEach(el => {
      el.classList.toggle('selected', !!companyUI.selectedEmployeeId && el.dataset.id === companyUI.selectedEmployeeId);
    });
  }

  function renderEmployeeDialog() {
    const host=document.querySelector('#employeeDialogHost');
    if(!host) return;
    const e=state.employees.find(x=>x.id===companyUI.selectedEmployeeId);

    if(!e){
      if(host.innerHTML) host.innerHTML='';
      companyUI.dialogSignature='';
      companyUI.openReportId=null;
      return;
    }

    const anchor=document.querySelector(`.sim-employee[data-id="${e.id}"]`);
    if(!anchor) return;

    const task=activeTask(e.id);
    const reports=state.reports.filter(r=>r.employeeId===e.id).slice(0,3);
    const openReport=reports.find(r=>r.id===companyUI.openReportId) || null;
    const vstate=employeeVisualState(e);
    const meta=statusMeta[vstate]||statusMeta.idle;
    const progress = task ? (task.status==='working'?65:task.status==='queued'?15:task.status==='opened'?40:100) : 0;
    const project=task?.projectId?state.projects.find(p=>p.id===task.projectId):null;

    const office=document.querySelector('.sim-office');
    const officeRect=office.getBoundingClientRect();
    const anchorRect=anchor.getBoundingClientRect();
    const anchorCenterX=anchorRect.left-officeRect.left+(anchorRect.width/2);
    const anchorCenterY=anchorRect.top-officeRect.top+(anchorRect.height/2);
    const placeLeft=anchorCenterX > officeRect.width*0.62;
    const top=Math.max(14,Math.min(officeRect.height-510,anchorCenterY-210));
    const left=placeLeft ? Math.max(14,anchorCenterX-430) : Math.min(officeRect.width-404,anchorCenterX+70);

    const signature = [
      e.id,e.name,e.rank,e.department,e.provider,e.role,e.traits,e.spriteStyle,
      vstate,task?.id,task?.status,task?.automationError,project?.name,
      reports.map(r=>`${r.id}:${r.task}:${r.createdAt}`).join('|'),
      companyUI.openReportId || ''
    ].join('::');

    const existing=host.querySelector('.employee-popover');
    if(existing && companyUI.dialogSignature===signature){
      existing.style.left=`${left}px`;
      existing.style.top=`${top}px`;
      existing.classList.toggle('popover-left',placeLeft);
      existing.classList.toggle('popover-right',!placeLeft);
      return;
    }

    companyUI.dialogSignature=signature;

    const reportList = reports.length
      ? `<div class="recent-report-titles">${reports.map(r=>`
          <button class="recent-report-title ${companyUI.openReportId===r.id?'active':''}" data-report-id="${r.id}">
            <span>📄 ${escapeHtml(r.task)}</span>
            <small>${new Date(r.createdAt).toLocaleDateString()}</small>
          </button>
        `).join('')}</div>`
      : '<div class="no-current-task">아직 보고 기록이 없습니다.</div>';

    const reportDetail = openReport
      ? `<div class="recent-report-detail">
          <div class="recent-report-detail-head">
            <b>${escapeHtml(openReport.task)}</b>
            <button class="close-report-detail">접기</button>
          </div>
          <pre>${escapeHtml(String(openReport.result||''))}</pre>
        </div>`
      : '';

    host.innerHTML=`
      <div class="employee-popover ${placeLeft?'popover-left':'popover-right'}" style="left:${left}px;top:${top}px">
        <button class="employee-popover-close" aria-label="닫기">✕</button>
        <div class="popover-profile">
          <div class="popover-avatar">${pixelAvatar(e,vstate,true)}</div>
          <div class="popover-profile-copy">
            <div class="inspector-name-line"><h2>${escapeHtml(e.name)}</h2></div>
            <div class="status-chip ${vstate}"><i></i>${escapeHtml(meta[0])}</div>
            <p class="profile-meta">${escapeHtml(e.department||'미지정')} <span class="profile-divider">|</span> ${escapeHtml(e.rank||'사원')}</p>
            <p class="profile-role">${escapeHtml(e.role||'일반 업무')}</p>
          </div>
        </div>

        <div class="popover-section">
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

        <div class="popover-section">
          <div class="section-title"><h3>최근 보고</h3><span class="report-count">${reports.length}건</span></div>
          ${reportList}
          ${reportDetail}
        </div>

        <div class="popover-actions">
          <button class="btn ghost inspector-edit">정보 수정</button>
          <button class="btn primary inspector-task" ${task?'':'disabled'}>업무 상세</button>
          <button class="btn ghost inspector-more" aria-label="더보기">•••</button>
        </div>
      </div>`;

    host.querySelector('.employee-popover-close')?.addEventListener('click',(event)=>{
      event.stopPropagation();
      companyUI.selectedEmployeeId=null;
      companyUI.openReportId=null;
      companyUI.dialogSignature='';
      renderEmployeeDialog();
      updateSelectedEmployeeStyles();
    });

    host.querySelectorAll('.recent-report-title').forEach(btn=>{
      btn.addEventListener('click',(event)=>{
        event.stopPropagation();
        companyUI.openReportId = companyUI.openReportId===btn.dataset.reportId ? null : btn.dataset.reportId;
        companyUI.dialogSignature='';
        renderEmployeeDialog();
      });
    });

    host.querySelector('.close-report-detail')?.addEventListener('click',(event)=>{
      event.stopPropagation();
      companyUI.openReportId=null;
      companyUI.dialogSignature='';
      renderEmployeeDialog();
    });

    host.querySelector('.inspector-edit')?.addEventListener('click',(event)=>{event.stopPropagation();openEmployeeModal(e.id)});
    host.querySelector('.inspector-more')?.addEventListener('click',(event)=>{event.stopPropagation();switchView('employees')});
    host.querySelector('.inspector-task')?.addEventListener('click',(event)=>{
      event.stopPropagation();
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
  document.querySelector('.sim-office')?.addEventListener('click', (event) => {
    if (event.target.closest('.sim-employee') || event.target.closest('.employee-popover')) return;
    companyUI.selectedEmployeeId = null;
    companyUI.openReportId = null;
    companyUI.dialogSignature = '';
    renderEmployeeDialog();
    updateSelectedEmployeeStyles();
  });
  const version = document.querySelector('.sidebar-foot small');
  if (version) version.textContent = 'v1.6.3 · CEO Rebuilt As Employee';

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