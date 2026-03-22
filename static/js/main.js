/* TomatoScan — Frontend JavaScript */

let currentFile = null;
let currentBase64 = null;
let currentMediaType = 'image/jpeg';
let cameraStream = null;

/* ===== TAB ===== */
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (tab === 'upload') {
    document.getElementById('tabUpload').classList.add('active');
    document.getElementById('uploadPanel').classList.remove('hidden');
    document.getElementById('cameraPanel').classList.add('hidden');
    stopCamera();
  } else {
    document.getElementById('tabCamera').classList.add('active');
    document.getElementById('cameraPanel').classList.remove('hidden');
    document.getElementById('uploadPanel').classList.add('hidden');
  }
}

/* ===== FAYL YUKLASH ===== */
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.add('drag-over');
}
function handleDragLeave() {
  document.getElementById('dropZone').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) processFile(f);
  else showError('Faqat rasm fayllari qabul qilinadi');
}
function handleFile(e) {
  const f = e.target.files[0];
  if (f) processFile(f);
}

function processFile(file) {
  currentFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const url = e.target.result;
    const m = url.match(/^data:([^;]+);base64,/);
    if (m) currentMediaType = m[1];
    currentBase64 = url;
    const kb = (file.size / 1024).toFixed(1);
    showPreview(url, `${file.name} · ${currentMediaType} · ${kb} KB`);
  };
  reader.readAsDataURL(file);
}

/* ===== KAMERA ===== */
async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    document.getElementById('videoEl').srcObject = cameraStream;
    document.getElementById('camOverlay').style.display = 'none';
    document.getElementById('captureBtn').style.display = 'inline-flex';
    document.getElementById('stopBtn').style.display = 'inline-flex';
  } catch {
    showError('Kameraga ruxsat berilmagan. Brauzer sozlamalarini tekshiring.');
  }
}

function capturePhoto() {
  const video = document.getElementById('videoEl');
  const canvas = document.getElementById('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  currentBase64 = canvas.toDataURL('image/jpeg', 0.92);
  currentMediaType = 'image/jpeg';
  currentFile = null;
  showPreview(currentBase64, 'Kameradan olingan rasm · JPEG');
  stopCamera();
  switchTab('upload');
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  document.getElementById('camOverlay').style.display = 'flex';
  document.getElementById('captureBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'none';
}

/* ===== PREVIEW ===== */
function showPreview(src, meta = '') {
  document.getElementById('previewImg').src = src;
  document.getElementById('previewMeta').textContent = meta;
  document.getElementById('previewSection').classList.remove('hidden');
  document.getElementById('analyzeBtn').classList.remove('hidden');
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('resultSection').innerHTML = '';
  document.getElementById('errorSection').classList.add('hidden');
}

function resetAll() {
  currentFile = null; currentBase64 = null;
  document.getElementById('previewSection').classList.add('hidden');
  document.getElementById('analyzeBtn').classList.add('hidden');
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('resultSection').innerHTML = '';
  document.getElementById('errorSection').classList.add('hidden');
  document.getElementById('loadingSection').classList.add('hidden');
  document.getElementById('fileInput').value = '';
  document.getElementById('uploadPanel').classList.remove('hidden');
}

function showError(msg) {
  document.getElementById('loadingSection').classList.add('hidden');
  document.getElementById('errorSection').classList.remove('hidden');
  document.getElementById('errorMsg').textContent = msg;
  document.getElementById('analyzeBtn').disabled = false;
}

/* ===== LOADING STEPS ===== */
let stepTimer = null;
function startSteps() {
  ['ls1','ls2','ls3'].forEach(id => document.getElementById(id).classList.remove('active','done'));
  let i = 0;
  stepTimer = setInterval(() => {
    if (i > 0) {
      document.getElementById('ls' + i).classList.remove('active');
      document.getElementById('ls' + i).classList.add('done');
    }
    if (i < 3) {
      document.getElementById('ls' + (i + 1)).classList.add('active');
      i++;
    } else clearInterval(stepTimer);
  }, 1300);
}
function stopSteps() {
  clearInterval(stepTimer);
  ['ls1','ls2','ls3'].forEach(id => {
    document.getElementById(id).classList.remove('active');
    document.getElementById(id).classList.add('done');
  });
}

/* ===== TAHLIL ===== */
async function analyze() {
  if (!currentFile && !currentBase64) return;

  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true;
  document.getElementById('loadingSection').classList.remove('hidden');
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('errorSection').classList.add('hidden');
  startSteps();

  try {
    let resp;

    if (currentFile) {
      /* Flask backend orqali */
      const fd = new FormData();
      fd.append('image', currentFile);
      resp = await fetch('/analyze', { method: 'POST', body: fd });
    } else {
      /* Base64 (kamera) orqali */
      resp = await fetch('/analyze-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: currentBase64 })
      });
    }

    stopSteps();
    const data = await resp.json();
    document.getElementById('loadingSection').classList.add('hidden');

    if (!resp.ok || !data.success) {
      showError(data.error || 'Server xatosi yuz berdi');
      return;
    }
    renderResult(data.result);

  } catch (err) {
    stopSteps();
    document.getElementById('loadingSection').classList.add('hidden');
    showError('Tarmoq xatosi: ' + err.message);
  }

  btn.disabled = false;
}

/* ===== NATIJANI KO'RSATISH ===== */
function renderResult(r) {
  const sec = document.getElementById('resultSection');

  /* Header */
  let hClass = 'disease', icon = '🦠', title = r.disease_uz || 'Kasallik aniqlandi';
  if (r.status === 'healthy') { hClass = 'healthy'; icon = '✅'; title = 'Sog\'lom Barg'; }
  if (r.status === 'unknown') { hClass = 'unknown'; icon = '❓'; title = 'Aniqlab Bo\'lmadi'; }

  /* Severity */
  const sevMap = {
    low:    { label: 'Kam xavfli',       dots: [1,0,0], cls: 'low' },
    medium: { label: 'O\'rtacha xavfli', dots: [1,1,0], cls: 'mid' },
    high:   { label: 'Yuqori xavf ⚠️',  dots: [1,1,1], cls: 'hgh' }
  };
  const sev = sevMap[r.severity] || sevMap.low;
  const dotsHTML = sev.dots.map(f => `<div class="sdot ${f ? sev.cls : ''}"></div>`).join('');

  /* Qismlar */
  const sympHTML = (r.symptoms || []).map(s => `<span class="tag-red">• ${s}</span>`).join('');
  const simHTML  = (r.similar_diseases || []).map(s => `<span class="tag-blue">🔍 ${s}</span>`).join('');

  const treatHTML = (r.treatment || []).map((t, i) =>
    `<div class="tstep"><div class="tnum">${i+1}</div><div class="ttxt">${t}</div></div>`
  ).join('');

  const medsHTML = (r.medicines || []).map(m => `
    <div class="med-card">
      <div class="med-type">${m.type || ''}</div>
      <div class="med-name">💊 ${m.name}</div>
      ${m.active_ingredient ? `<div class="med-ai">Faol modda: ${m.active_ingredient}</div>` : ''}
      <div class="med-dose">${m.dose}</div>
      ${m.frequency ? `<div class="med-freq">⏱ ${m.frequency}</div>` : ''}
      ${m.caution ? `<div class="med-warn">⚠️ ${m.caution}</div>` : ''}
    </div>`).join('');

  const prevHTML = (r.prevention || []).map(p =>
    `<div class="pitem"><span class="pcheck">✓</span> ${p}</div>`
  ).join('');

  /* Body */
  let body = '';
  if (r.status === 'healthy') {
    body = `
      <div class="rsec"><div class="rlabel">ℹ️ Holat</div>
        <div class="rtext">${r.description || 'Barg sog\'lom ko\'rinadi. Kasallik belgilari topilmadi.'}</div>
      </div>
      ${prevHTML ? `<div class="rsec"><div class="rlabel">🛡️ Profilaktika tavsiyalari</div><div class="prev-list">${prevHTML}</div></div>` : ''}`;
  } else if (r.status === 'disease') {
    body = `
      ${r.urgency ? `<div class="alert danger"><div class="alert-ico">🚨</div><div class="alert-txt"><strong>Shoshilinch:</strong> ${r.urgency}</div></div>` : ''}
      <div class="rsec"><div class="rlabel">📝 Kasallik haqida</div><div class="rtext">${r.description || ''}</div></div>
      ${r.causes ? `<div class="rsec"><div class="rlabel">🔍 Sabablari</div><div class="rtext">${r.causes}</div></div>` : ''}
      ${r.spread ? `<div class="rsec"><div class="rlabel">📡 Tarqalishi</div><div class="rtext">${r.spread}</div></div>` : ''}
      <div class="rsec">
        <div class="rlabel">🩺 Og'irlik darajasi</div>
        <div class="sev-row">${dotsHTML}<span class="sev-lbl">${sev.label}</span></div>
      </div>
      ${sympHTML ? `<div class="rsec"><div class="rlabel">🔴 Kasallik alomatlari</div><div class="tags-row">${sympHTML}</div></div>` : ''}
      ${r.economic_loss ? `<div class="rsec"><div class="rlabel">💰 Iqtisodiy zarar</div><div class="rtext">${r.economic_loss}</div></div>` : ''}
      ${treatHTML ? `<div class="rsec"><div class="rlabel">🌱 Davolash bosqichlari</div><div class="treat-list">${treatHTML}</div></div>` : ''}
      ${medsHTML ? `<div class="rsec"><div class="rlabel">💊 Tavsiya etiladigan dorilar</div><div class="meds-grid">${medsHTML}</div></div>` : ''}
      ${prevHTML ? `<div class="rsec"><div class="rlabel">🛡️ Profilaktika</div><div class="prev-list">${prevHTML}</div></div>` : ''}
      ${simHTML ? `<div class="rsec"><div class="rlabel">🔗 O'xshash kasalliklar</div><div class="tags-row">${simHTML}</div></div>` : ''}
      <div class="alert info">
        <div class="alert-ico">ℹ️</div>
        <div class="alert-txt">Bu tashxis dastlabki ko'rsatma. Aniq davolash uchun mutaxassis agronoma murojaat qiling.</div>
      </div>`;
  } else {
    body = `<div class="rsec"><div class="rtext">Rasmdan pomidor bargi aniqlanmadi. Iltimos, aniqroq va yaqinroq rasm yuklang.</div></div>`;
  }

  sec.innerHTML = `
    <div class="res-card">
      <div class="res-header ${hClass}">
        <div class="res-icon">${icon}</div>
        <div>
          <div class="res-title">${title}</div>
          <div class="res-sub">${r.disease_en ? r.disease_en + ' · ' : ''}Ishonch: ${r.confidence || 0}%</div>
          <div class="conf-track"><div class="conf-fill" id="confFill"></div></div>
        </div>
      </div>
      <div class="res-body">${body}</div>
      <div class="res-footer">
        <button class="btn-red" onclick="resetAll()">🔄 Yangi Tahlil</button>
        <button class="btn-outline" onclick="window.print()">🖨️ Chop etish</button>
      </div>
    </div>`;

  sec.classList.remove('hidden');
  setTimeout(() => {
    const fill = document.getElementById('confFill');
    if (fill) fill.style.width = (r.confidence || 0) + '%';
  }, 150);
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
