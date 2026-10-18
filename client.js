// HIPO: standalone daily game. No server, login, or WebSocket required.
const $ = (selector) => document.querySelector(selector);
const now = new Date();
const dayIndex = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(2024, 0, 1)) / 86400000);
const puzzleNumber = String(dayIndex + 1).padStart(3, "0");
const storageKey = "hipo:daily:" + dayIndex;
function puzzleFor(day, round) {
  const index = day * 3 + round;
  const a = 2 + ((index * 3) % 8);
  const b = 2 + ((index * 5 + 1) % 8);
  const c = 3 + ((index * 7 + 2) % 7);
  const d = 1 + ((index * 11 + 3) % 6);
  const mode = index % 4;
  let target;
  if (mode === 0) target = a * b + c - d;
  else if (mode === 1) target = a * b - c + d;
  else if (mode === 2) target = a * (b + c) - d;
  else target = (a + b) * c - d;
  if (target <= 0) target = a * b + c + d;
  return { numbers: [a, b, c, d], target };
}
function evaluate(expression, expectedNumbers) {
  if (typeof expression !== "string" || expression.length > 120 || !expression.trim()) return { ok: false, message: "Enter an expression first." };
  const tokens = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch)) {
      let end = i + 1;
      while (end < expression.length && /[0-9]/.test(expression[end])) end++;
      tokens.push({ type: "number", value: Number(expression.slice(i, end)) });
      i = end;
      continue;
    }
    const normalized = ch === "×" ? "*" : ch === "÷" ? "/" : ch;
    if ("()+-*/".includes(normalized)) { tokens.push({ type: normalized, value: normalized }); i++; continue; }
    return { ok: false, message: "Use only numbers, +, −, ×, ÷ and parentheses." };
  }
  const used = tokens.filter(t => t.type === "number").map(t => t.value).sort((a,b)=>a-b);
  const expected = [...expectedNumbers].sort((a,b)=>a-b);
  if (used.length !== expected.length || used.some((v,j)=>v !== expected[j])) return { ok:false, message:"Use each of the four numbers exactly once." };
  let cursor = 0;
  function factor() {
    const token = tokens[cursor];
    if (token?.type === "+" || token?.type === "-") { cursor++; const value=factor(); return token.type === "-" ? -value : value; }
    if (token?.type === "(") { cursor++; const value=expressionSum(); if(tokens[cursor]?.type !== ")") throw new Error("Close your parentheses."); cursor++; return value; }
    if (token?.type !== "number") throw new Error("Check your expression.");
    cursor++; return token.value;
  }
  function term() {
    let value=factor();
    while(tokens[cursor]?.type === "*" || tokens[cursor]?.type === "/") { const op=tokens[cursor++].type; const right=factor(); if(op === "/" && right === 0) throw new Error("You can't divide by zero."); value=op === "*" ? value*right : value/right; }
    return value;
  }
  function expressionSum() {
    let value=term();
    while(tokens[cursor]?.type === "+" || tokens[cursor]?.type === "-") { const op=tokens[cursor++].type; const right=term(); value=op === "+" ? value+right : value-right; }
    return value;
  }
  try { const value=expressionSum(); if(cursor !== tokens.length || !Number.isFinite(value)) return {ok:false,message:"Check your expression and parentheses."}; return {ok:true,value}; }
  catch(error) { return {ok:false,message:error instanceof Error ? error.message : "Check your expression."}; }
}
function freshState() { return { solved:[false,false,false], attempts:[0,0,0], roundPoints:[0,0,0], feedback:"", feedbackKind:"" }; }
let state;
try { state = JSON.parse(localStorage.getItem(storageKey)) || freshState(); } catch { state = freshState(); }
if (!Array.isArray(state.solved) || state.solved.length !== 3) state = freshState();
let toastHandle = null;
function save() { localStorage.setItem(storageKey, JSON.stringify(state)); }
function firstUnsolved() { return state.solved.findIndex(done => !done); }
function showFeedback(message, kind="") { $("#feedback").textContent=message; $("#feedback").className=("feedback "+kind).trim(); }
function showToast(message) { const toast=$("#toast"); toast.textContent=message; toast.classList.remove("hidden"); clearTimeout(toastHandle); toastHandle=setTimeout(()=>toast.classList.add("hidden"),2200); }
function render() {
  const score=state.roundPoints.reduce((sum,p)=>sum+p,0);
  $("#day-pill").textContent="PUZZLE #"+puzzleNumber;
  $("#daily-number").textContent="#"+puzzleNumber;
  $("#score").textContent=String(score).padStart(3,"0");
  $("#solved-count").textContent=state.solved.filter(Boolean).length+" / 3";
  $("#attempt-count").textContent=String(state.attempts.reduce((sum,n)=>sum+n,0));
  [...$("#progress").children].forEach((bar,index)=>bar.classList.toggle("done",state.solved[index]));
  if (state.solved.every(Boolean)) {
    $("#active-round").classList.add("hidden"); $("#round-complete").classList.add("hidden"); $("#finish").classList.remove("hidden");
    $("#finish-title").textContent=score>=525 ? "Hippo genius." : score>=400 ? "Nice work, friend." : "Challenge complete.";
    $("#finish-copy").textContent="You solved all three rounds and earned "+score+" points. Come back tomorrow for a new set.";
    return;
  }
  const index=firstUnsolved(); const puzzle=puzzleFor(dayIndex,index);
  $("#active-round").classList.remove("hidden"); $("#round-complete").classList.add("hidden"); $("#finish").classList.add("hidden");
  $("#round-heading").textContent="Round "+(index+1)+" of 3";
  $("#round-points").textContent="+"+Math.max(100,200-state.attempts[index]*25)+" pts available";
  $("#target").textContent=puzzle.target;
  $("#numbers").replaceChildren(...puzzle.numbers.map(number=>{const tile=document.createElement("div");tile.className="number-tile";tile.textContent=String(number);return tile;}));
  $("#expression").disabled=false; $("#submit").disabled=false;
  showFeedback(state.feedback || "Hugo believes in you.",state.feedbackKind || "");
}
$("#answer-form").addEventListener("submit",event=>{
  event.preventDefault(); if(firstUnsolved()<0) return;
  const expression=$("#expression").value.trim(); if(!expression){showFeedback("Enter an expression first.","error");return;}
  const index=firstUnsolved(); const puzzle=puzzleFor(dayIndex,index); const result=evaluate(expression,puzzle.numbers);
  state.attempts[index]++;
  if(!result.ok) { state.feedback=result.message; state.feedbackKind="error"; }
  else if(Math.abs(result.value-puzzle.target)>1e-9) { state.feedback="You got "+Number(result.value.toFixed(4))+". Keep going!"; state.feedbackKind="error"; }
  else { state.solved[index]=true; state.roundPoints[index]=Math.max(100,200-(state.attempts[index]-1)*25); state.feedback="Perfect! +"+state.roundPoints[index]+" points"; state.feedbackKind="success"; }
  $("#expression").value=""; save(); render();
});
for(const button of document.querySelectorAll("[data-insert]")) button.addEventListener("click",()=>{const input=$("#expression");if(input.disabled)return;const start=input.selectionStart??input.value.length,end=input.selectionEnd??input.value.length,insert=button.dataset.insert;input.value=input.value.slice(0,start)+insert+input.value.slice(end);input.focus();const cursor=start+insert.length;input.setSelectionRange(cursor,cursor);});
$("#share").addEventListener("click",async()=>{
  const score=state.roundPoints.reduce((sum,p)=>sum+p,0); const solved=state.solved.filter(Boolean).length; const attempts=state.attempts.reduce((sum,n)=>sum+n,0);
  const squares=state.roundPoints.map(points=>points>=175?"🟩":points>0?"🟨":"⬜").join("");
  const shareText="HIPO #"+puzzleNumber+"\n"+squares+"\n"+score+" points · "+solved+"/3 solved · "+attempts+" attempts\nCan you beat Hugo? "+location.href.split("?")[0];
  try { await navigator.clipboard.writeText(shareText); showToast("Score card copied — go challenge someone!"); }
  catch { const area=document.createElement("textarea");area.value=shareText;document.body.append(area);area.select();document.execCommand("copy");area.remove();showToast("Score card copied!"); }
});
render();
