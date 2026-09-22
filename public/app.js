let currentSessionId = null;
let currentSession = null;
const $ = id => document.getElementById(id);
const LAST_SESSION_KEY = 'medikiosk:lastSessionId';

function show(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = $(view); if (target) target.classList.add('active');
  document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  const titles = {dashboard:'Dashboard',intake:'Patient Intake',documents:'Documents & OCR',timeline:'Clinical Timeline',medications:'Medication Review',safety:'Safety Signals',summary:'AI Physician Summary',record:'FHIR-ready Record'};
  $('pageTitle').textContent = titles[view] || view;
}

document.querySelectorAll('.nav').forEach(n => n.onclick = () => show(n.dataset.view));
$('newPatient').onclick = startNewPatient;

async function api(path, options = {}) {
  const r = await fetch(path, options);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}
function setFormValue(id, value) { if ($(id)) $(id).value = value ?? ''; }

function startNewPatient() {
  currentSessionId = null; currentSession = null;
  localStorage.removeItem(LAST_SESSION_KEY);
  ['name','age','complaint','story'].forEach(id => setFormValue(id, ''));
  if ($('lang')) $('lang').value = 'Hindi';
  $('intakeResult').innerHTML = '<div class="notice">New patient workspace ready. Previous records remain saved in History.</div>';
  $('ocrText').textContent = 'No document processed yet.';
  $('summaryBox').innerHTML = '<div class="empty">No summary generated. Create an intake session first.</div>';
  $('json').textContent = '{ "status": "waiting", "resource": "Bundle" }';
  $('sessionBadge').textContent = 'No active patient';
  show('intake');
}

async function createSession() {
  const payload = {patientName:$('name').value,patientAge:$('age').value,language:$('lang').value,chiefComplaint:$('complaint').value,story:$('story').value};
  try {
    const d = await api('/api/sessions', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    currentSessionId = d.sessionId;
    localStorage.setItem(LAST_SESSION_KEY, currentSessionId);
    await loadSession(currentSessionId, {announce:false});
    $('intakeResult').innerHTML = '<div class="notice">Session saved permanently. You can leave and return later without losing this patient record.</div>';
    await loadRecentSessions();
    show('documents');
  } catch (e) { $('intakeResult').innerHTML = '<div class="notice">'+esc(e.message)+'</div>'; }
}

async function loadRecentSessions() {
  try {
    const d = await api('/api/sessions?limit=8');
    const box = $('recentSessions');
    if (!box) return;
    if (!d.sessions?.length) { box.innerHTML = '<div class="empty">No saved patient sessions yet.</div>'; return; }
    box.innerHTML = d.sessions.map(s => '<button class="history-item '+(s.id===currentSessionId?'selected':'')+'" onclick="loadSession(\''+s.id+'\')"><span><b>'+esc(s.patientName || 'Unnamed patient')+'</b><small>'+esc(s.chiefComplaint || 'No complaint')+' · '+esc(s.language || 'English')+'</small></span><em>'+formatDate(s.updatedAt)+'</em></button>').join('');
  } catch (e) {
    if ($('recentSessions')) $('recentSessions').innerHTML = '<div class="notice">History could not be loaded.</div>';
  }
}

async function loadSession(id, opts = {}) {
  try {
    const d = await api('/api/sessions/' + encodeURIComponent(id));
    currentSessionId = d.session.id;
    currentSession = d.session;
    localStorage.setItem(LAST_SESSION_KEY, currentSessionId);
    hydrateSession(d);
    await loadRecentSessions();
    if (opts.announce !== false) show('dashboard');
  } catch (e) {
    localStorage.removeItem(LAST_SESSION_KEY);
    if ($('intakeResult')) $('intakeResult').innerHTML = '<div class="notice">Saved session could not be opened: '+esc(e.message)+'</div>';
  }
}

function hydrateSession(d) {
  const s = d.session;
  setFormValue('name', s.patientName);
  setFormValue('age', s.patientAge);
  setFormValue('lang', s.language || 'Hindi');
  setFormValue('complaint', s.chiefComplaint);
  setFormValue('story', s.patientStory);
  $('sessionBadge').textContent = `Saved session · ${s.documents.length} document${s.documents.length===1?'':'s'}`;
  renderDocuments(d);
  renderTimeline(d.events || []);
  renderMedications(d.documents || []);
  renderSafety(d.documents || []);
  if (s.lastSummary) {
    $('summaryBox').innerHTML = '<div class="notice">Saved AI documentation draft. Clinician verification required.</div><div class="result-box">'+esc(JSON.stringify(s.lastSummary,null,2))+'</div>';
    renderFHIR(s.lastSummary);
  } else {
    $('summaryBox').innerHTML = '<div class="empty">No summary generated for this session yet.</div>';
  }
  $('ocrText').textContent = d.documents.length ? d.documents.map(doc => 'DOCUMENT: '+doc.filename+'\n'+(doc.ocrText || 'No OCR text')+'\n\nSTRUCTURED EXTRACTION\n'+JSON.stringify(doc.extraction || {},null,2)).join('\n\n--------------------\n\n') : 'No document processed yet.';
}

function renderDocuments(d) {
  const box = $('documentList'); if (!box) return;
  if (!d.documents.length) { box.innerHTML = '<div class="empty">No documents saved for this patient.</div>'; return; }
  box.innerHTML = d.documents.map(doc => '<div class="saved-doc"><div><b>'+esc(doc.filename)+'</b><small>'+esc(doc.contentType)+' · '+formatDate(doc.createdAt)+'</small></div><span class="pill">'+esc(doc.verificationStatus || 'pending')+'</span></div>').join('');
}

function renderTimeline(events) {
  const box = $('timelineList'); if (!box) return;
  if (!events.length) { box.innerHTML = '<div class="empty">No events yet.</div>'; return; }
  box.innerHTML = events.map(e => '<div class="tl"><span></span><div><b>'+esc(humanEvent(e.eventType))+'</b><small>'+esc(e.source)+' · '+formatDate(e.createdAt)+'</small></div></div>').join('');
}
function humanEvent(x) { return String(x||'event').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()); }

function renderMedications(docs) {
  const rows=[];
  docs.forEach(doc => (doc.extraction?.medications || []).forEach(m => rows.push('<tr><td>'+esc(m.name||'—')+'</td><td>'+esc(m.strength||'—')+'</td><td>'+esc(m.frequency||'—')+'</td><td>'+esc(doc.filename)+'</td><td><span class="pill">'+esc(doc.verificationStatus||'pending')+'</span></td></tr>')));
  $('medicationRows').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" class="empty">No medications extracted yet.</td></tr>';
}

function renderSafety(docs) {
  const signals=[];
  docs.forEach(doc => (doc.extraction?.redFlagsForClinicianReview || []).forEach(x => signals.push(String(x))));
  const box=$('safetyList');
  if (!box) return;
  box.innerHTML = signals.length ? signals.map(x=>'<div class="notice">△ '+esc(x)+'</div>').join('') : '<div class="safety-empty">△<h3>No persisted safety signals</h3><p>Signals will appear when structured extraction identifies information for clinician review.</p></div>';
}

async function runOCR() {
  const f=$('doc').files[0];
  if(!f)return $('ocrStatus').innerHTML='<div class="notice">Choose a document first.</div>';
  if(!currentSessionId)return $('ocrStatus').innerHTML='<div class="notice">Create or restore a patient session first.</div>';
  const fd=new FormData();fd.append('file',f);fd.append('sessionId',currentSessionId);
  $('ocrStatus').innerHTML='<p class="muted">Processing document securely…</p>';
  try {
    const d=await api('/api/ocr',{method:'POST',body:fd});
    $('ocrStatus').innerHTML='<div class="notice">OCR completed and saved. Document ID: '+esc(d.documentId)+'</div>';
    $('ocrText').textContent=d.text;
    await extractDoc(d.documentId);
    await loadSession(currentSessionId,{announce:false});
    show('documents');
  } catch(e) { $('ocrStatus').innerHTML='<div class="notice">'+esc(e.message)+'</div>'; }
}

async function extractDoc(documentId){
  try {
    const d=await api('/api/documents/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId})});
    $('ocrText').textContent+='\n\nSTRUCTURED EXTRACTION\n'+JSON.stringify(d.data,null,2);
  } catch(e) { $('ocrStatus').innerHTML='<div class="notice">'+esc(e.message)+'</div>'; }
}

async function generateSummary(){
  if(!currentSessionId)return $('summaryBox').innerHTML='<div class="empty">Create or restore an intake session first.</div>';
  $('summaryBox').innerHTML='<p class="muted">Generating clinician draft…</p>';
  try {
    const d=await api('/api/summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:currentSessionId})});
    $('summaryBox').innerHTML='<div class="notice">Saved AI-generated documentation draft. Clinician verification required.</div><div class="result-box">'+esc(JSON.stringify(d.summary,null,2))+'</div>';
    renderFHIR(d.summary); await loadSession(currentSessionId,{announce:false}); show('summary');
  } catch(e) { $('summaryBox').innerHTML='<div class="notice">'+esc(e.message)+'</div>'; }
}

function renderFHIR(s){$('json').textContent=JSON.stringify({resourceType:'Bundle',type:'document',status:'draft',meta:{provenance:'MediKiosk clinical intake'},entry:[{resourceType:'Patient',name:$('name').value,age:$('age').value},{resourceType:'ClinicalDocument',summary:s}]},null,2)}
function formatDate(x){if(!x)return '—';const d=new Date(x);return isNaN(d)?String(x):d.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});}
function esc(x){return String(x??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\':'&#39;'}[m]||m))}

async function initApp(){
  if (window.hatchable?.auth) {
    const authSession = await window.hatchable.auth.getSession();
    if (!authSession?.user) {
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
      return;
    }
    const user = authSession.user;
    const badge = document.querySelector('.status');
    if (badge) badge.textContent = '● Signed in · ' + (user.email || user.name || 'patient');
  }
  await loadRecentSessions();
  const last=localStorage.getItem(LAST_SESSION_KEY);
  if(last) await loadSession(last,{announce:false});
  if(!currentSessionId){
    const d=await api('/api/sessions?limit=1').catch(()=>({sessions:[]}));
    if(d.sessions?.[0]) await loadSession(d.sessions[0].id,{announce:false});
  }
  if(currentSessionId) $('resumeNotice').innerHTML='<div class="notice">Last patient record restored from the server. Nothing was lost when you left the website.</div>';
}
window.addEventListener('DOMContentLoaded', initApp);