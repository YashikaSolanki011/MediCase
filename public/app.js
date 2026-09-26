async function getAuthClient(){if(window.__medikioskSupabase)return window.__medikioskSupabase;if(!window.supabase){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}if(!window.MEDIKIOSK_CONFIG){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/config.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}window.__medikioskSupabase=window.supabase.createClient(window.MEDIKIOSK_CONFIG.supabaseUrl,window.MEDIKIOSK_CONFIG.supabaseAnonKey);return window.__medikioskSupabase;}
let currentSessionId = null;
let currentSession = null;

const adaptiveState = { questions: [], index: 0, answers: {} };

function buildAdaptiveQuestions() {
  const complaint = String($('complaint')?.value || currentSession?.chiefComplaint || '').toLowerCase();
  const questions = [
    {id:'onset',label:'When did the problem begin?',type:'text',placeholder:'e.g. 3 days ago'},
    {id:'severity',label:'How severe is it right now?',type:'select',options:['Mild','Moderate','Severe']},
    {id:'associated',label:'Are there any other symptoms or changes you noticed?',type:'text',placeholder:'Describe any associated symptoms'}
  ];
  if (/(pain|ache|headache|stomach|abdomen|chest|back|joint|throat)/.test(complaint)) {
    questions.splice(1,0,{id:'location',label:'Where exactly is the problem located?',type:'text',placeholder:'e.g. left side of abdomen'});
  }
  if (/(fever|cough|cold|infection|vomit|diarr|breath|respirat)/.test(complaint)) {
    questions.splice(1,0,{id:'frequency',label:'How often is it happening?',type:'text',placeholder:'e.g. 3 times today'});
  }
  return questions;
}

function renderAdaptiveQuestion() {
  const box=$('adaptiveQuestion'), next=$('adaptiveNext'), skip=$('adaptiveSkip'), progress=$('adaptiveProgress');
  if(!box) return;
  if(!currentSessionId){ box.innerHTML='<div class="empty">Create an intake session to begin adaptive questioning.</div>'; next.disabled=true; skip.disabled=true; if(progress)progress.textContent=''; return; }
  if(!adaptiveState.questions.length) adaptiveState.questions=buildAdaptiveQuestions();
  const q=adaptiveState.questions[adaptiveState.index];
  if(!q){ box.innerHTML='<div class="notice">Adaptive intake complete. Your answers are saved in the clinical timeline.</div>'; next.disabled=true; skip.disabled=true; if(progress)progress.textContent='Complete'; return; }
  const value=adaptiveState.answers[q.id]||'';
  const control=q.type==='select'
    ? '<select id="adaptiveAnswer"><option value="">Select an answer</option>'+q.options.map(o=>'<option '+(o===value?'selected':'')+'>'+esc(o)+'</option>').join('')+'</select>'
    : '<input id="adaptiveAnswer" value="'+esc(value)+'" placeholder="'+esc(q.placeholder||'')+'">';
  box.innerHTML='<div class="adaptive-label"><span>Question '+(adaptiveState.index+1)+' of '+adaptiveState.questions.length+'</span><b>'+esc(q.label)+'</b>'+control+'</div>';
  next.disabled=false; skip.disabled=false;
  if(progress)progress.textContent=(adaptiveState.index)+' answered · '+(adaptiveState.questions.length-adaptiveState.index)+' remaining';
}

async function saveAdaptiveAnswer(skip=false) {
  if(!currentSessionId) return;
  const q=adaptiveState.questions[adaptiveState.index];
  if(!q) return;
  const value=skip?'Not answered':String($('adaptiveAnswer')?.value||'').trim();
  adaptiveState.answers[q.id]=value;
  try {
    await api('/api/sessions/'+encodeURIComponent(currentSessionId),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({adaptiveAnswer:{questionId:q.id,question:q.label,answer:value}})});
    adaptiveState.index++;
    renderAdaptiveQuestion();
    await loadSession(currentSessionId,{announce:false});
  } catch(e) {
    $('intakeResult').innerHTML='<div class="notice">'+esc(e.message)+'</div>';
  }
}
function skipAdaptiveQuestion(){ saveAdaptiveAnswer(true); }
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
  const S=await getAuthClient(); const {data}=await S.auth.getSession();
  const headers=new Headers(options.headers||{}); if(data.session) headers.set('Authorization','Bearer '+data.session.access_token);
  const r = await fetch(path, {...options,headers});
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
  renderCurrentPatientCard();
  show('intake');
}

async function createSession() {
  const payload = {patientName:$('name').value,patientAge:$('age').value,language:$('lang').value,chiefComplaint:$('complaint').value,story:$('story').value};
  try {
    const d = await api('/api/sessions', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    currentSessionId = d.sessionId;
    localStorage.setItem(LAST_SESSION_KEY, currentSessionId);
    await loadSession(currentSessionId, {announce:false});
    $('intakeResult').innerHTML = '<div class="notice">Session saved permanently. Adaptive questions are now available.</div>';
    adaptiveState.questions=buildAdaptiveQuestions(); adaptiveState.index=0; adaptiveState.answers={}; renderAdaptiveQuestion();
    renderCurrentPatientCard();
    show('documents');
  } catch (e) { $('intakeResult').innerHTML = '<div class="notice">'+esc(e.message)+'</div>'; }
}

function renderCurrentPatientCard(){
  const box=$('currentPatientCard'); if(!box)return;
  if(!currentSession){box.innerHTML='<div class="empty">No active patient record.</div>';return;}
  box.innerHTML='<div class="current-patient"><b>'+esc(currentSession.patientName||'Unnamed patient')+'</b><small>'+esc(currentSession.chiefComplaint||'No chief complaint recorded')+' · '+esc(currentSession.language||'English')+'</small><small>Record updated '+formatDate(currentSession.updatedAt)+'</small></div>';
}
async function loadRecentSessions(){ return; }

async function loadSession(id, opts = {}) {
  try {
    const d = await api('/api/sessions/' + encodeURIComponent(id));
    currentSessionId = d.session.id;
    currentSession = d.session;
    localStorage.setItem(LAST_SESSION_KEY, currentSessionId);
    hydrateSession(d);
    renderCurrentPatientCard();
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
  renderCurrentPatientCard();
  renderDocuments(d);
  renderTimeline(d.events || []);
  if (!adaptiveState.questions.length || adaptiveState.index >= adaptiveState.questions.length) { adaptiveState.questions=buildAdaptiveQuestions(); adaptiveState.index=0; }
  renderAdaptiveQuestion();
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
  box.innerHTML = events.map(e => '<div class="tl"><span></span><div><b>'+esc(humanEvent(e.eventType))+'</b><small>'+esc(e.source)+' · '+formatDate(e.createdAt)+'</small>'+eventDetail(e)+'</div></div>').join('');
}
function humanEvent(x) { return String(x||'event').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()); }
function eventDetail(e){const p=e.payload||{};if(e.eventType==='adaptive_question_answered')return '<div class="event-detail"><b>'+esc(p.question||'Question')+':</b> '+esc(p.answer||'Not answered')+'</div>';if(e.eventType==='session_created')return '<div class="event-detail">'+esc(p.chiefComplaint||'')+'</div>';return '';}

function medicationKey(m){return String(m?.name||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ')}
function renderMedications(docs){
  const meds=[];
  docs.forEach(doc => (doc.extraction?.medications || []).forEach(m => meds.push({...m,source:doc.filename,status:doc.verificationStatus||'pending'})));
  const byName={}; meds.forEach(m=>{const k=medicationKey(m);if(k)(byName[k] ||= []).push(m);});
  let duplicates=0,conflicts=0; Object.values(byName).forEach(list=>{if(list.length>1){duplicates+=list.length-1;const variants=new Set(list.map(x=>[x.strength||'',x.frequency||'',x.dose||''].join('|')));if(variants.size>1)conflicts++;}});
  const unverified=meds.filter(m=>m.status!=='verified').length;
  if($('medDuplicateCount'))$('medDuplicateCount').textContent=String(duplicates);
  if($('medConflictCount'))$('medConflictCount').textContent=String(conflicts);
  if($('medUnverifiedCount'))$('medUnverifiedCount').textContent=String(unverified);
  if($('medicationNotice'))$('medicationNotice').innerHTML=meds.length?'<div class="notice">Medication facts were extracted from source documents. Clinician verification is required before they become trusted clinical data.</div>':'<div class="notice">No medication facts yet. Upload a prescription/report and run <b>OCR & extract</b> first.</div>';
  $('medicationRows').innerHTML=meds.length?meds.map(m=>'<tr><td><b>'+esc(m.name||'—')+'</b></td><td>'+esc(m.strength||'—')+'</td><td>'+esc([m.dose,m.route].filter(Boolean).join(' · ')||'—')+'</td><td>'+esc(m.frequency||'—')+'</td><td>'+esc(m.duration||'—')+'</td><td>'+esc(m.source)+'</td><td><span class="pill">'+esc(m.status)+'</span></td></tr>').join(''):'<tr><td colspan="7" class="empty">No medications extracted yet.</td></tr>';
}
async function refreshMedicationReview(){
  if(!currentSessionId){$('medicationNotice').innerHTML='<div class="notice">Create or restore a patient record first.</div>';return;}
  try{const d=await api('/api/sessions/'+encodeURIComponent(currentSessionId));renderMedications(d.session.documents||[]);$('medicationNotice').innerHTML='<div class="notice">Medication review refreshed from the latest saved extraction.</div>';}catch(e){$('medicationNotice').innerHTML='<div class="notice">'+esc(e.message)+'</div>';}
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

async function configureAdminLink(){const link=document.querySelector('a[href="/admin"]');if(!link)return;try{const S=await getAuthClient();const {data}=await S.auth.getSession();if(!data.session){link.style.display='none';return;}const r=await fetch('/api/admin/dashboard',{headers:{Authorization:'Bearer '+data.session.access_token}});if(!r.ok)link.style.display='none';}catch{link.style.display='none';}}
async function initApp(){
  const S=await getAuthClient();
  const {data:authSession}=await S.auth.getSession();
  if (!authSession?.session?.user) { window.location.href='/login?next='+encodeURIComponent(window.location.pathname); return; }
  const user=authSession.session.user;
  await configureAdminLink();
  const badge=document.querySelector('.status');
  if (badge) badge.textContent='● Signed in · '+(user.email || 'patient');
  const last=localStorage.getItem(LAST_SESSION_KEY);
  if(last) await loadSession(last,{announce:false});
  if(currentSessionId) $('resumeNotice').innerHTML='<div class="notice">Your current patient record is restored privately from the server.</div>';
}
window.addEventListener('DOMContentLoaded', initApp);