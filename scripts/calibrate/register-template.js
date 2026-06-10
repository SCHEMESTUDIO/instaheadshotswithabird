// ============================================================
//  register.html template (step 2 of 3).
//  buildRegister(rows, opts) → a self-contained HTML string.
//  rows: [{ id, face, look, lookLabel, score, selfie<dataURI>, render<dataURI> }]
//  The score is embedded but HIDDEN until you finish labelling, so it
//  can't bias your eye. All stats run client-side — no server, no deps.
// ============================================================

export function buildRegister(rows, opts = {}) {
  const DATA = JSON.stringify({ rows, opts });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Likeness calibration · this-or-that register</title>
<style>
  :root{ --bg:#0f1115; --card:#181b22; --line:#2a2f3a; --fg:#e8eaed; --mut:#9aa3b2;
         --keep:#1f9d63; --keep2:#27c07a; --bad:#d2455b; --bad2:#f25e74; --accent:#6aa8ff; }
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--fg)}
  header{padding:14px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:16px;position:sticky;top:0;background:var(--bg);z-index:5}
  header h1{font-size:15px;margin:0;font-weight:600}
  .bar{flex:1;height:6px;background:#252a34;border-radius:99px;overflow:hidden}
  .bar > i{display:block;height:100%;background:var(--accent);width:0;transition:width .2s}
  .count{color:var(--mut);font-variant-numeric:tabular-nums;white-space:nowrap}
  main{max-width:920px;margin:0 auto;padding:24px 20px 80px}
  /* ---- labelling card ---- */
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
  figure img{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:#000}
  figcaption{padding:8px 12px;color:var(--mut);font-size:12.5px;letter-spacing:.02em;text-transform:uppercase}
  .q{text-align:center;margin:22px 0 8px;color:var(--mut)}
  .q b{color:var(--fg)}
  .btns{display:flex;gap:14px;justify-content:center;margin-top:14px}
  button.choice{flex:1;max-width:300px;padding:16px;border:1px solid var(--line);border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;color:#fff;transition:transform .05s, filter .15s}
  button.choice:hover{filter:brightness(1.12)} button.choice:active{transform:translateY(1px)}
  .keep{background:var(--keep)} .bad{background:var(--bad)}
  .kbd{display:block;font-weight:400;font-size:12px;opacity:.8;margin-top:4px}
  .meta{text-align:center;color:var(--mut);font-size:12.5px;margin-top:18px}
  .ghost{background:none;border:1px solid var(--line);color:var(--mut);padding:7px 12px;border-radius:8px;cursor:pointer;font-size:13px}
  .ghost:hover{color:var(--fg)}
  /* ---- results ---- */
  .verdict{border-radius:14px;padding:20px 22px;margin:0 0 22px;border:1px solid var(--line)}
  .verdict h2{margin:0 0 6px;font-size:18px}
  .verdict p{margin:6px 0;color:var(--mut)}
  .good{border-color:#1f6f4a;background:#11241b} .warn{border-color:#7a5a1f;background:#241e11} .stop{border-color:#7a2330;background:#241114}
  .big{font-size:34px;font-weight:700;font-variant-numeric:tabular-nums}
  table{width:100%;border-collapse:collapse;margin:10px 0;font-variant-numeric:tabular-nums}
  th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:right;font-size:13.5px}
  th:first-child,td:first-child{text-align:left}
  tr.rec td{background:#142033;color:#cfe0ff;font-weight:600}
  .pill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:600}
  .pill.k{background:#11241b;color:var(--keep2)} .pill.b{background:#241114;color:var(--bad2)}
  .row2{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
  code{background:#0b0d11;border:1px solid var(--line);border-radius:6px;padding:2px 7px;color:#cfe0ff}
  .hide{display:none}
  .muted{color:var(--mut)}
  .scoreReveal{font-variant-numeric:tabular-nums}
</style>
</head>
<body>
<header>
  <h1>this-or-that · likeness</h1>
  <div class="bar"><i id="prog"></i></div>
  <span class="count" id="count">0 / 0</span>
  <button class="ghost" id="undo">↶ back</button>
</header>
<main>
  <div id="banner"></div>
  <section id="label">
    <div class="pair">
      <figure><img id="imgSelfie" alt="reference selfie"><figcaption>their selfie (reference)</figcaption></figure>
      <figure><img id="imgRender" alt="AI render"><figcaption id="capRender">AI render</figcaption></figure>
    </div>
    <p class="q">Does the render on the right <b>convincingly look like the same person</b>?</p>
    <div class="btns">
      <button class="choice keep" id="bKeep">Looks like them — KEEP<span class="kbd">K  /  ←</span></button>
      <button class="choice bad" id="bBad">Off / uncanny — RE-ROLL<span class="kbd">J  /  →</span></button>
    </div>
    <p class="meta">Score is hidden on purpose — label with your eyes, not the number. <button class="ghost" id="skip">skip this one</button></p>
  </section>
  <section id="results" class="hide"></section>
</main>
<script>
const { rows, opts } = ${DATA};
const genCost = (opts && opts.genCost) || (opts && opts.opts && opts.opts.genCost) || 0.08;
const PROVIDER = (opts && opts.provider) || "";
let i = 0;
const labels = {};               // id -> "keep" | "bad" | "skip"
const order = rows.map(r => r.id);

const $ = s => document.querySelector(s);
if (opts && opts.banner){
  const b=$("#banner");
  b.innerHTML = opts.banner;
  b.style.cssText="margin:0 0 18px;padding:12px 16px;border:1px solid #7a5a1f;background:#241e11;color:#e8d9b0;border-radius:12px;font-size:13.5px;line-height:1.5";
}
function render(){
  if (i >= rows.length) return finish();
  const r = rows[i];
  $("#imgSelfie").src = r.selfie;
  $("#imgRender").src = r.render;
  $("#capRender").textContent = r.lookLabel ? ("AI render · " + r.lookLabel) : "AI render";
  const done = i;
  $("#count").textContent = done + " / " + rows.length;
  $("#prog").style.width = (100*done/rows.length) + "%";
}
function choose(v){
  if (i >= rows.length) return;
  labels[rows[i].id] = v; i++; render();
}
$("#bKeep").onclick = ()=>choose("keep");
$("#bBad").onclick  = ()=>choose("bad");
$("#skip").onclick  = ()=>choose("skip");
$("#undo").onclick  = ()=>{ if(i>0){ i--; delete labels[rows[i].id]; $("#results").classList.add("hide"); $("#label").classList.remove("hide"); render(); } };
document.addEventListener("keydown", e=>{
  if (e.key==="k"||e.key==="K"||e.key==="ArrowLeft") choose("keep");
  else if (e.key==="j"||e.key==="J"||e.key==="ArrowRight") choose("bad");
  else if (e.key==="s"||e.key==="S") choose("skip");
  else if (e.key==="Backspace"){ e.preventDefault(); $("#undo").click(); }
});

// ---------- stats ----------
function auc(good, bad){ // P(good score > bad score); >0.5 means higher score = more likely good
  if(!good.length||!bad.length) return NaN;
  let w=0,t=0; for(const g of good) for(const b of bad){ if(g>b)w++; else if(g===b)t++; }
  return (w + 0.5*t)/(good.length*bad.length);
}
function sweep(good, bad){
  const all=[...good,...bad].sort((a,b)=>a-b);
  const uniq=[...new Set(all)];
  const cands=[uniq[0]-0.001];
  for(let k=0;k<uniq.length-1;k++) cands.push((uniq[k]+uniq[k+1])/2);
  cands.push(uniq[uniq.length-1]+0.001);
  const N=good.length+bad.length;
  return cands.map(t=>{
    const caught = bad.filter(s=>s<t).length;          // uncanny correctly re-rolled
    const wrong  = good.filter(s=>s<t).length;          // good wrongly re-rolled
    const flagged= caught+wrong;
    const recall = caught/bad.length;                   // sensitivity
    const fpr    = wrong/good.length;                   // false-reroll rate
    return { t, recall, fpr, J: recall-fpr, flaggedFrac: flagged/N, caught, wrong };
  });
}
function fmtPct(x){ return (100*x).toFixed(0)+"%"; }

function finish(){
  $("#label").classList.add("hide");
  const res = $("#results"); res.classList.remove("hide");
  $("#count").textContent = rows.length + " / " + rows.length; $("#prog").style.width="100%";

  const kept = rows.filter(r=>labels[r.id]==="keep");
  const bad  = rows.filter(r=>labels[r.id]==="bad");
  const goodS = kept.map(r=>r.score), badS = bad.map(r=>r.score);
  const A = auc(goodS, badS);

  let head="", cls="", body="";
  if (kept.length<3 || bad.length<3){
    cls="warn"; head="Not enough labels yet";
    body="<p>You labelled <b>"+kept.length+"</b> keep and <b>"+bad.length+"</b> uncanny. Stats need at least ~3 of each (ideally 10+). Generate more renders or label more before trusting a threshold.</p>";
    res.innerHTML = card(cls,head,body)+exportRow(); wireExport(kept,bad); return;
  }

  const sw = sweep(goodS, badS);
  const best = sw.reduce((a,b)=> b.J>a.J ? b : a);
  const recT = Math.round(best.t*100)/100;

  // headline verdict keyed on AUC = does the score separate good from uncanny at all?
  if (A >= 0.8){ cls="good"; head="The score separates good from uncanny — tuning a threshold will work.";
    body="<p>AUC <b class='scoreReveal'>"+A.toFixed(2)+"</b>: a random good render outscores a random uncanny one "+fmtPct(A)+" of the time. A cut is meaningful.</p>"; }
  else if (A >= 0.65){ cls="warn"; head="Partial separation — a threshold helps but won't catch everything.";
    body="<p>AUC <b class='scoreReveal'>"+A.toFixed(2)+"</b>. The score leans the right way but overlaps a lot. A threshold will catch the worst renders and let subtle-uncanny ones through. Consider also attacking likeness upstream (prompt / provider / restore pass).</p>"; }
  else { cls="stop"; head="The score does NOT separate uncanny from good — threshold-tuning is a dead end.";
    body="<p>AUC <b class='scoreReveal'>"+A.toFixed(2)+"</b> (0.5 = random). The face-matcher can't tell your uncanny renders from your good ones, so no value of SIM_THRESHOLD will fix this without also re-rolling good renders. The uncanny problem lives upstream — prompt, provider, or restore settings — not in the gate. Don't ship a threshold off this data.</p>"; }

  // recommendation block
  let rec = "";
  if (A >= 0.65){
    rec = card("", "Recommended threshold",
      "<div class='big scoreReveal'>SIM_THRESHOLD = "+recT.toFixed(2)+"</div>"+
      "<p>Catches <b>"+fmtPct(best.recall)+"</b> of uncanny renders while wrongly re-rolling <b>"+fmtPct(best.fpr)+"</b> of good ones. "+
      "Re-rolls <b>"+fmtPct(best.flaggedFrac)+"</b> of renders overall ≈ <b>$"+(best.flaggedFrac*genCost).toFixed(3)+"</b> added per render (×REROLLS_PER_LOOK).</p>"+
      "<p class='muted'>This maximises (uncanny caught − good wrongly re-rolled). Want fewer annoyed customers? pick a row lower in the table (lower threshold, fewer good re-rolls). Want to catch more uncanny? pick higher.</p>");
  }

  // tradeoff table — a readable subset of operating points
  const picks = pickRows(sw, best.t);
  let tbl = "<table><thead><tr><th>SIM_THRESHOLD</th><th>uncanny caught</th><th>good re-rolled</th><th>renders re-rolled</th><th>$ added / render</th></tr></thead><tbody>";
  for(const r of picks){
    const isRec = Math.abs(r.t-best.t)<1e-9;
    tbl += "<tr class='"+(isRec?"rec":"")+"'><td>"+(Math.round(r.t*100)/100).toFixed(2)+(isRec?" ◀ rec":"")+"</td><td>"+fmtPct(r.recall)+"</td><td>"+fmtPct(r.fpr)+"</td><td>"+fmtPct(r.flaggedFrac)+"</td><td>$"+(r.flaggedFrac*genCost).toFixed(3)+"</td></tr>";
  }
  tbl += "</tbody></table>";

  const counts = "<p class='muted'>Labelled <span class='pill k'>"+kept.length+" keep</span> <span class='pill b'>"+bad.length+" uncanny</span>"+(rows.filter(r=>labels[r.id]==="skip").length?(" · "+rows.filter(r=>labels[r.id]==="skip").length+" skipped"):"")+" · provider "+PROVIDER+"</p>";

  res.innerHTML = card(cls,head,body) + rec + card("", "Threshold tradeoffs", counts+tbl + caveat()) + exportRow();
  wireExport(kept,bad);
}
function pickRows(sw, bestT){
  // show ~9 evenly-spaced operating points plus the recommended one
  const out=[]; const step=Math.max(1,Math.floor(sw.length/8));
  for(let k=0;k<sw.length;k+=step) out.push(sw[k]);
  if(!out.find(r=>Math.abs(r.t-bestT)<1e-9)) out.push(sw.find(r=>Math.abs(r.t-bestT)<1e-9));
  return out.sort((a,b)=>a.t-b.t);
}
function caveat(){ return "<p class='muted' style='margin-top:14px'>Caveat: synthetic single-photo inputs score a little lower than production's two-photo jobs, so treat the absolute number as a starting point and confirm on a handful of real jobs (set <code>SIM_THRESHOLD=0</code> in Render, read the logged scores, adjust). The separation verdict above transfers; the exact cut should be re-checked on real selfies.</p>"; }
function card(cls,h,b){ return "<div class='verdict "+cls+"'><h2>"+h+"</h2>"+b+"</div>"; }
function exportRow(){ return "<div class='row2'><button class='ghost' id='dl'>⬇ download labels.json</button><button class='ghost' id='restart'>↺ relabel from start</button></div>"; }
function wireExport(kept,bad){
  const dl=$("#dl"); if(dl) dl.onclick=()=>{
    const payload={ createdAt:new Date().toISOString(), provider:PROVIDER,
      labels: rows.map(r=>({id:r.id,face:r.face,look:r.look,score:r.score,label:labels[r.id]||"unlabelled"})) };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="labels.json"; a.click();
  };
  const rs=$("#restart"); if(rs) rs.onclick=()=>{ i=0; for(const k in labels) delete labels[k]; $("#results").classList.add("hide"); $("#label").classList.remove("hide"); render(); };
}
render();
</script>
</body>
</html>`;
}
