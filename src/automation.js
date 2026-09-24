const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildInjectionScript(prompt) {
  const p = JSON.stringify(prompt);
  return [
    '(() => {',
    'const prompt=' + p + ';',
    'const visible=(el)=>!!(el&&el.getClientRects().length&&!el.disabled);',
    'const list=[',
    'document.querySelector("#prompt-textarea"),',
    'document.querySelector("textarea[placeholder*=Message]"),',
    'document.querySelector("textarea[placeholder*=메시지]"),',
    'document.querySelector("textarea"),',
    '...document.querySelectorAll("[contenteditable=true]")',
    '].filter(visible);',
    'const input=list[list.length-1];',
    'if(!input)return {ok:false,stage:"input",error:"입력창을 찾지 못했습니다."};',
    'input.focus();',
    'if(input.tagName==="TEXTAREA"||input.tagName==="INPUT"){',
    'const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),"value")?.set;',
    'if(setter)setter.call(input,prompt);else input.value=prompt;',
    'input.dispatchEvent(new Event("input",{bubbles:true}));',
    'input.dispatchEvent(new Event("change",{bubbles:true}));',
    '}else{',
    'input.textContent=prompt;',
    'input.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:prompt}));',
    '}',
    'const buttons=[...document.querySelectorAll("button")].filter(visible);',
    'const send=buttons.find((b)=>{const a=((b.getAttribute("aria-label")||"")+" "+(b.getAttribute("data-testid")||"")+" "+(b.title||"")).toLowerCase();return /send|submit|보내|전송/.test(a);});',
    'if(send){send.click();return {ok:true,stage:"submitted",method:"button"};}',
    'return {ok:true,stage:"needs-enter",method:"keyboard"};',
    '})()'
  ].join('');
}

function buildExtractionScript() {
  return [
    '(() => {',
    'const selectors=["[data-message-author-role=assistant]","[data-testid*=assistant]","main article","main .markdown","main [class*=response]"];',
    'let nodes=[];',
    'for(const s of selectors){const found=[...document.querySelectorAll(s)].filter((el)=>el.innerText&&el.innerText.trim().length>20);if(found.length)nodes=found;}',
    'const el=nodes[nodes.length-1];',
    'return el?el.innerText.trim():"";',
    '})()'
  ].join('');
}

async function automateSubscription(win, provider, prompt) {
  await sleep(1200);
  let submit;
  try {
    submit = await win.webContents.executeJavaScript(buildInjectionScript(prompt), true);
  } catch (error) {
    return { ok:false, stage:'inject', error:error.message };
  }

  if (!submit?.ok) return submit || { ok:false, error:'자동 입력에 실패했습니다.' };

  if (submit.stage === 'needs-enter') {
    win.webContents.sendInputEvent({ type:'keyDown', keyCode:'ENTER' });
    win.webContents.sendInputEvent({ type:'keyUp', keyCode:'ENTER' });
  }

  let last = '';
  let stable = 0;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    if (win.isDestroyed()) return { ok:false, stage:'closed', error:'AI 창이 닫혔습니다.' };
    let text = '';
    try {
      text = await win.webContents.executeJavaScript(buildExtractionScript(), true);
    } catch {}
    if (text && text.length > 20) {
      if (text === last) stable += 1;
      else { last = text; stable = 0; }
      if (stable >= 2) return { ok:true, result:text, provider, automated:true };
    }
  }

  return {
    ok:false,
    stage:'timeout',
    error:'답변 자동 회수 시간이 초과되었습니다. 수동 결과 입력을 사용하세요.',
    partial:last || ''
  };
}

module.exports = { automateSubscription };
