/* ห้องสอบ · หน้าเว็บ (ทำงานร่วมกับ Supabase Edge Function)
   แก้ค่าด้านล่างนี้เพียงจุดเดียว: ใส่ที่อยู่ของ Edge Function */
var API_URL = 'https://jrirkjpofliqxqtwhrzz.supabase.co/functions/v1/exam';

(function () {
'use strict';
var app = document.getElementById('app');
var LET = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ'];

/* ---------- helpers ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function nid(p) { return p + Math.random().toString(36).slice(2, 8); }
function clock(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
function dur(ms) { var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return h ? h + ':' + pad(m) + ':' + pad(r) : m + ':' + pad(r); }
function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(arr, seed) { var a = arr.slice(), r = rng(hash(seed)); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3200); }
function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

function msgOf(code) {
  var m = {
    config: 'ยังไม่ได้ตั้งค่าที่อยู่ระบบ (API_URL) ในไฟล์ app.js',
    network: 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง',
    closed: 'ข้อสอบนี้ปิดรับแล้ว',
    submitted: 'คุณส่งข้อสอบนี้แล้ว ทำได้ครั้งเดียว',
    name_mismatch: 'ชื่อไม่ตรงกับเลขที่นี้ที่เคยใช้ กรุณาตรวจชื่อหรือแจ้งครู',
    no_exam: 'ไม่พบข้อสอบนี้ อาจถูกลบแล้ว',
    bad_no: 'เลขที่ต้องเป็นตัวเลข 1 ถึง 3 หลัก',
    bad_name: 'กรุณาใส่ชื่อ-สกุล',
    unauthorized: 'รหัสผู้สอนไม่ถูกต้อง',
    not_live: 'ครูยังไม่เริ่มสอบ กรุณารอในห้องรอ',
    ended: 'ข้อสอบนี้หมดเวลาแล้ว'
  };
  return m[code] || ('เกิดข้อผิดพลาด (' + code + ')');
}

/* ---------- state ---------- */
var S = {
  booted: false, fatal: null, err: null,
  isTeacher: false, token: '', loginErr: '',
  exams: {}, examsSig: '',
  keys: {}, attempts: [], attSig: '',
  me: {}, meSig: '',
  area: 'student', intro: true, step: 'name', introLeft: 5, introTm: null,
  who: { name: '', no: '' },
  run: null, writing: false, again: false,
  examSel: null, detail: null, confirmReset: null, confirmDel: null, editing: null, editErr: null, saving: false,
  away: false, awaySince: 0, lastBlock: {}, tm: null, retry: null, lobby: null, starting: false
};
try { var j0 = JSON.parse(get('omr.who') || 'null'); if (j0 && typeof j0 === 'object') { S.who.name = String(j0.name || ''); S.who.no = String(j0.no || ''); } } catch (e) {}

/* ---------- network ---------- */
function api(action, body) {
  if (!API_URL || API_URL.indexOf('PASTE_') === 0) { var c = new Error('config'); c.code = 'config'; return Promise.reject(c); }
  var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var to = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : null;
  var payload = Object.assign({ action: action }, body || {});
  return fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    signal: ctl ? ctl.signal : undefined
  }).then(function (r) { return r.text(); }, function () {
    if (to) clearTimeout(to);
    var x = new Error('network'); x.code = 'network'; throw x;
  }).then(function (t) {
    if (to) clearTimeout(to);
    var j; try { j = JSON.parse(t); } catch (e) { var y = new Error('bad'); y.code = 'network'; throw y; }
    if (!j.ok) { var er = new Error(j.error || 'error'); er.code = j.error || 'error'; er.attempt = j.attempt; throw er; }
    return j;
  });
}

/* ---------- data loading ---------- */
async function loadExams() {
  try {
    var r = await api('exams');
    S.err = null;
    var map = {}; (r.exams || []).forEach(function (e) { map[e.id] = e; });
    var sig = JSON.stringify(r.exams || []);
    if (sig !== S.examsSig) { S.exams = map; S.examsSig = sig; return true; }
    return false;
  } catch (e) { S.err = e.code || 'error'; return false; }
}
async function loadTeacher() {
  try {
    var r = await api('teacher', { op: 'list', token: S.token });
    S.isTeacher = true; S.loginErr = '';
    var sig = JSON.stringify([r.attempts || [], r.keys || {}]);
    S.keys = r.keys || {}; S.attempts = r.attempts || [];
    if (sig !== S.attSig) { S.attSig = sig; return true; }
    return false;
  } catch (e) {
    if (e.code === 'unauthorized') {
      S.isTeacher = false; S.token = ''; put('hs.token', '');
      S.loginErr = 'รหัสผู้สอนไม่ถูกต้อง';
      if (S.area === 'exams' || S.area === 'live') S.area = 'student';
      return true;
    }
    return false;
  }
}
async function loadStatus() {
  if (!whoOk()) return false;
  try {
    var r = await api('status', { no: S.who.no, name: S.who.name });
    var sig = JSON.stringify(r.attempts || {});
    if (sig !== S.meSig) { S.me = r.attempts || {}; S.meSig = sig; return true; }
    return false;
  } catch (e) { return false; }
}
async function poll() {
  if (!S.booted || S.fatal) return;
  var ch = await loadExams();
  if (!S.run && S.area === 'student' && S.step === 'list') { if (await loadStatus()) ch = true; }
  if (S.isTeacher) { if (await loadTeacher()) ch = true; }
  if (ch) refreshView();
  checkLobby();
}
function refreshView() {
  if (!S.booted || S.fatal) return;
  if (S.run) {
    var ex = S.exams[S.run.examId], sig = ex ? String(ex.updatedAt) : 'gone';
    if (!S.run.preview && S.run.att.status !== 'submitted' && sig !== S.run.sig) { S.run.sig = sig; render(); }
    return;
  }
  if (S.editing) return;
  if (S.intro && S.area === 'student') return;
  if (S.area === 'login') return;
  if (S.area === 'live') { if (!document.getElementById('liveBody')) render(); else renderLiveParts(); }
  else if (S.area === 'exams') render();
  else if (S.area === 'student' && S.step === 'list' && whoOk()) {
    if (S.lobby) { render(); return; }
    var l = document.getElementById('examList');
    if (l) l.innerHTML = examListHTML(); else render();
    updateIdGate();
  }
}

/* ---------- boot ---------- */
async function boot() {
  render();
  if (!API_URL || API_URL.indexOf('PASTE_') === 0) { S.fatal = 'config'; return render(); }
  S.token = get('hs.token') || '';
  await loadExams();
  if (S.token) { await loadTeacher(); if (S.isTeacher) { S.intro = false; S.area = 'exams'; } }
  S.booted = true;
  render();
  setInterval(poll, 4000);
  setInterval(function () { if (!S.run && S.area === 'live' && S.isTeacher && document.getElementById('liveBody')) renderLiveParts(); }, 5000);
}

/* ---------- rendering ---------- */
function render() {
  if (S.fatal) { app.innerHTML = fatalHTML(); return; }
  if (!S.booted) { app.innerHTML = headerHTML(true) + '<main class="page"><p class="muted" style="padding:60px 0">กำลังเชื่อมต่อ…</p></main>'; return; }
  if (S.run) { app.innerHTML = S.run.att.status === 'submitted' ? doneHTML() : examHTML(); if (S.run.att.status !== 'submitted') afterExam(); return; }
  if (S.intro && S.area === 'student') { app.innerHTML = introHTML(); startIntro(); return; }
  var h = headerHTML() + '<main class="page">';
  if (S.err) h += '<div class="notice bad" style="margin-bottom:16px">' + esc(msgOf(S.err)) + '</div>';
  if (S.area === 'login') h += loginHTML();
  else if (S.area === 'live') h += liveHTML();
  else if (S.area === 'exams') h += S.editing ? editorHTML() : examsHTML();
  else if (S.step !== 'list' || !whoOk()) h += nameHTML();
  else h += S.lobby ? lobbyHTML() : homeHTML();
  h += '</main>';
  app.innerHTML = h;
  if (S.area === 'live' && document.getElementById('liveBody')) renderLiveParts();
  if (S.area === 'student') updateIdGate();
}
function fatalHTML() {
  return headerHTML(true) + '<main class="page"><div class="empty" style="margin-top:24px"><h2 style="color:var(--ink);margin-bottom:8px">ยังไม่สามารถเข้าระบบสอบได้</h2><p>' + msgOf(S.fatal) + '</p></div></main>';
}
function headerHTML(plain) {
  var role = S.isTeacher ? 'ผู้สอน' : 'นักเรียน';
  var nav = '';
  if (S.isTeacher && !plain) {
    var dis = S.editing ? ' disabled' : '';
    var tb = function (v, l) { return '<button class="tab" data-act="area" data-v="' + v + '"' + (S.area === v ? ' aria-current="page"' : '') + dis + '>' + l + '</button>'; };
    nav = '<nav class="tabbar" aria-label="เมนูผู้สอน">' + tb('exams', 'ข้อสอบ') + tb('live', 'ผลสด') + tb('student', 'หน้านักเรียน') + '</nav>';
  }
  var side = plain ? '' : (S.isTeacher
    ? '<button class="linkbtn small" data-act="logout">ออกจากโหมดผู้สอน</button>'
    : '<button class="linkbtn small" data-act="teacherlogin">สำหรับผู้สอน</button>');
  return '<header class="topbar"><div class="topbar-in"><div class="brand"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="align-self:center;flex:none"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg><b>ห้องสอบ</b><span>ระบบสอบออนไลน์</span></div><div class="hdr-r"><span class="role">' + role + '</span>' + side + '</div></div></header>' + nav;
}

/* ---------- intro countdown, name step, chart art ---------- */
function ringOff(n) { return (339.292 * (1 - n / 5)).toFixed(1); }
function chartSVG() {
  var cs = [[20,120,100,126,96],[52,100,112,116,92],[84,112,96,118,92],[116,96,78,100,74],[148,78,88,92,74],[180,88,64,90,60],[212,64,70,74,58],[244,70,46,72,42],[276,46,34,48,30]];
  var bars = cs.map(function (c) { var up = c[2] < c[1], top = Math.min(c[1], c[2]), h = Math.max(2, Math.abs(c[1] - c[2])); var col = up ? '#34D399' : '#F2C25C'; return '<path d="M' + (c[0] + 6) + ' ' + c[4] + 'V' + c[3] + '" stroke="' + col + '" stroke-width="2"/><rect x="' + c[0] + '" y="' + top + '" width="12" height="' + h + '" fill="' + col + '"/>'; }).join('');
  return '<svg class="art" viewBox="0 0 320 170" role="img" aria-label="กราฟแท่งเทียนที่ปรับตัวขึ้น"><g stroke="rgba(127,140,160,.22)" stroke-width="1"><path d="M0 40H320M0 85H320M0 130H320"/></g>' + bars + '<polyline points="20,140 60,118 100,124 140,96 180,88 220,62 260,50 296,26" fill="none" stroke="#F2C25C" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="300" cy="22" r="13" fill="#F2C25C"/><text x="300" y="27" text-anchor="middle" font-size="14" font-weight="700" fill="#0A1628">฿</text></svg>';
}
function introHTML() {
  return '<section class="intro"><div class="intro-in"><p class="intro-kicker">ระบบสอบออนไลน์ · การเงินและการลงทุน</p><h1 class="intro-h">พร้อมทดสอบความรู้ด้านการเงินหรือยัง</h1>' + chartSVG() +
    '<div class="ringwrap"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="54"/><circle class="bar" id="ringBar" cx="60" cy="60" r="54" style="stroke-dashoffset:' + ringOff(S.introLeft) + '"/></svg><div class="ringnum" id="cnt" aria-live="polite">' + S.introLeft + '</div></div>' +
    '<p class="intro-sub">กำลังพาไปหน้าลงชื่อ…</p><button class="btn ghost-light" data-act="skipintro">ข้ามไปเลย</button></div></section>';
}
function startIntro() {
  if (S.introTm) return;
  S.introTm = setInterval(function () {
    S.introLeft--;
    if (S.introLeft <= 0) { finishIntro(); return; }
    var el = document.getElementById('cnt'), bar = document.getElementById('ringBar');
    if (el) el.textContent = S.introLeft;
    if (bar) bar.style.strokeDashoffset = ringOff(S.introLeft);
  }, 1000);
}
function finishIntro() {
  clearInterval(S.introTm); S.introTm = null; S.intro = false; S.introLeft = 5; S.step = 'name'; render();
}
function nameHTML() {
  var ok = whoOk();
  return '<section class="namestep">' + chartSVG() + '<div><p class="kicker">ขั้นตอนที่ 1 จาก 2</p><h1 style="margin:8px 0 6px">กรอกข้อมูลผู้สอบ</h1><p class="muted" style="margin-bottom:18px">ใช้ชื่อและเลขที่ที่ตรงกับรายชื่อในห้องเรียน</p>' +
    '<div class="who" style="padding:0;border:0;margin:0"><label class="field"><span>ชื่อ-สกุล</span><input id="f-name" type="text" data-k="who-name" autocomplete="name" maxlength="60" value="' + esc(S.who.name) + '" placeholder="เช่น สมชาย ใจดี"></label>' +
    '<label class="field"><span>เลขที่</span><input id="f-no" type="text" inputmode="numeric" data-k="who-no" maxlength="3" value="' + esc(S.who.no) + '" placeholder="เช่น 12"></label></div>' +
    '<div style="margin-top:20px"><button id="nextBtn" class="btn accent block" data-act="tolist"' + (ok ? '' : ' disabled') + '>ถัดไป: เลือกข้อสอบ</button></div></div></section>';
}
function loginHTML() {
  return '<section class="namestep"><div><p class="kicker">สำหรับผู้สอน</p><h1 style="margin:8px 0 6px">เข้าสู่ระบบผู้สอน</h1><p class="muted" style="margin-bottom:18px">กรอกรหัสผู้สอนที่ตั้งไว้ในระบบ</p>' +
    '<div class="who" style="padding:0;border:0;margin:0"><label class="field"><span>รหัสผู้สอน</span><input id="f-token" type="password" autocomplete="current-password" data-k="token" value=""></label></div>' +
    (S.loginErr ? '<div class="notice bad" style="margin-top:14px">' + esc(S.loginErr) + '</div>' : '') +
    '<div style="margin-top:20px;display:grid;gap:10px"><button class="btn accent block" data-act="teachersubmit">เข้าสู่ระบบ</button><button class="btn ghost block" data-act="cancellogin">กลับ</button></div></div></section>';
}

/* ---------- student: home ---------- */
function myAttempt(id) { return S.me[id] || null; }
function whoOk() { return S.who.name.trim().length > 0 && /^\d{1,3}$/.test(String(S.who.no).trim()); }
function homeHTML() {
  return '<div class="sumwho"><div><p class="kicker">ผู้สอบ</p><b class="sumname">' + esc(S.who.name) + ' · เลขที่ ' + esc(S.who.no) + '</b></div><button class="btn ghost sm" data-act="editname">แก้ไข</button></div><h2 style="margin:10px 0 12px;font-size:19px">ข้อสอบที่เปิดรับ</h2>' +
    '<p class="hint" id="examCount" style="margin-bottom:4px"></p><div class="exlist" id="examList">' + examListHTML() + '</div>';
}
function examsSorted() {
  return Object.keys(S.exams).map(function (id) { return Object.assign({ id: id }, S.exams[id]); }).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
}
function examListHTML() {
  var out = [];
  examsSorted().forEach(function (e) {
    var a = myAttempt(e.id), active = a && a.status !== 'submitted';
    if (!e.open && !active) return;
    var n = (e.questions || []).length, st = '', btn = '';
    if (a && a.status === 'submitted') { st = '<span class="state done">ส่งแล้ว ' + clock(a.submittedAt) + '</span>'; btn = '<span class="state plain">ทำได้ครั้งเดียว</span>'; }
    else if (a && a.status === 'waiting') {
      if (e.liveAt) { st = '<span class="state doing">ครูเริ่มสอบแล้ว</span>'; btn = '<button class="btn accent" data-act="start" data-id="' + e.id + '" data-needid>เข้าสอบ</button>'; }
      else { st = '<span class="state plain">อยู่ในห้องรอ</span>'; btn = '<button class="btn ghost" data-act="lobby" data-id="' + e.id + '" data-needid>กลับห้องรอ</button>'; }
    }
    else if (active) { st = '<span class="state doing">กำลังทำค้างอยู่</span>'; btn = '<button class="btn accent" data-act="start" data-id="' + e.id + '" data-needid>ทำต่อ</button>'; }
    else { btn = '<button class="btn accent" data-act="join" data-id="' + e.id + '" data-needid>เข้าห้องรอ</button>'; }
    out.push('<article class="excard"><h3>' + esc(e.title) + '</h3><div class="meta"><span>' + n + ' ข้อ</span><span>·</span><span>' + (e.minutes || 0) + ' นาที</span>' + (st ? '<span>·</span>' + st : '') + '</div>' + (e.proctor ? '<p class="rule">โหมดคุมสอบ: ระบบจะบันทึกเมื่อคุณออกจากหน้านี้</p>' : '') + '<footer>' + btn + '</footer></article>');
  });
  if (!out.length) return '<div class="empty">ยังไม่มีข้อสอบที่เปิดรับ เมื่อครูเปิดรับแล้ว รายการจะขึ้นที่นี่</div>';
  return out.join('');
}
/* ---------- student: waiting room ---------- */
function lobbyHTML() {
  var ex = S.exams[S.lobby];
  if (!ex) { S.lobby = null; return homeHTML(); }
  var head = '<div class="sumwho"><div><p class="kicker">ผู้สอบ</p><b class="sumname">' + esc(S.who.name) + ' · เลขที่ ' + esc(S.who.no) + '</b></div></div><h2 style="margin:10px 0 12px;font-size:19px">' + esc(ex.title) + '</h2>';
  if (ex.liveAt) {
    return head + '<section style="text-align:center;padding:30px 0"><p class="kicker">เริ่มสอบแล้ว</p><h1 style="margin:8px 0 6px">ครูเริ่มให้ทำข้อสอบได้แล้ว</h1><p class="muted" style="margin-bottom:18px">' + (ex.proctor ? 'กดปุ่มแล้วระบบจะเข้าสู่โหมดเต็มจอ' : 'กดปุ่มด้านล่างเพื่อเริ่มทำข้อสอบ') + '</p><button class="btn accent block" data-act="start" data-id="' + esc(ex.id) + '">เข้าสอบเลย</button></section>';
  }
  return head + '<section style="text-align:center;padding:40px 0"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:var(--accent)" aria-hidden="true"></span><p class="kicker" style="margin-top:16px">อยู่ในห้องรอ</p><h1 style="margin:8px 0 6px">รอครูกดเริ่มสอบ</h1><p class="muted">หน้านี้จะเปลี่ยนให้เองเมื่อครูเริ่มสอบ ไม่ต้องรีเฟรช</p><div style="margin-top:24px"><button class="btn ghost" data-act="leavelobby">ออกจากห้องรอ</button></div></section>';
}
async function joinLobby(id) {
  if (!whoOk()) return;
  S.who.name = S.who.name.trim(); S.who.no = String(S.who.no).trim();
  put('omr.who', JSON.stringify(S.who));
  try {
    var r = await api('join', { examId: id, no: S.who.no, name: S.who.name });
    S.me[id] = r.attempt; S.meSig = '';
    if (r.attempt && r.attempt.status === 'waiting') S.lobby = id;
    render();
  } catch (e) {
    if (e.code === 'submitted' && e.attempt) { S.me[id] = e.attempt; S.meSig = ''; }
    if (e.code === 'closed') await loadExams();
    toast(msgOf(e.code)); render();
  }
}
// เมื่อครูกดเริ่มสอบ ให้นักเรียนในห้องรอเข้าสอบเองโดยอัตโนมัติ
async function checkLobby() {
  if (!S.lobby || S.run || S.starting) return;
  var ex = S.exams[S.lobby];
  if (!ex || !ex.liveAt) return;
  S.starting = true;
  try { await startAttempt(S.lobby, false); } finally { S.starting = false; }
}
function updateIdGate() {
  var ok = whoOk();
  var bs = document.querySelectorAll('[data-needid]');
  for (var i = 0; i < bs.length; i++) bs[i].disabled = !ok;
  var nb = document.getElementById('nextBtn'); if (nb) nb.disabled = !ok;
}

/* ---------- student: exam ---------- */
function ordered(ex) { var qs = ex.questions || []; return ex.shuffle ? shuffle(qs, S.who.no + '|' + S.run.examId) : qs; }
function leaveCount(att) { var n = 0; (att.events || []).forEach(function (e) { if (e.t === 'leave') n++; }); return n; }
function examHTML() {
  var R = S.run, att = R.att, ex = S.exams[R.examId];
  var veil = '';
  if (R.needFs) veil = '<div class="veil"><div class="panel"><h2>กลับเข้าโหมดเต็มจอ</h2><p class="muted">ข้อสอบนี้ต้องทำในโหมดเต็มจอ แตะปุ่มด้านล่างเพื่อทำข้อสอบต่อ</p><button class="btn accent block" data-act="fsback">กลับเข้าโหมดเต็มจอ</button></div></div>';
  var quit = R.preview ? '<button class="btn ghost sm" data-act="exitpreview">ออกจากการดูตัวอย่าง</button>' : '';
  var bar = '<header class="xbar"><div class="xbar-in"><div class="xt"><strong>' + esc(att.title) + '</strong><span>' + (R.preview ? 'ดูตัวอย่าง ไม่มีการบันทึกผล' : 'เลขที่ ' + esc(S.who.no) + ' · ' + esc(S.who.name)) + '</span></div><span class="timer" id="tmr" aria-live="off">--</span></div></header>';
  var sub = '<div class="xsub"><span id="sv"></span>' + (att.proctor && !R.preview ? '<span>ออกจากหน้าสอบแล้ว <b id="lvc">' + leaveCount(att) + '</b> ครั้ง</span>' : '') + quit + '</div>';
  var notice = R.notice ? '<div class="notice" style="margin-bottom:16px;display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap"><span>' + esc(R.notice) + '</span><button class="btn ghost sm" data-act="dismiss">รับทราบ</button></div>' : '';
  if (!ex) return veil + bar + '<main class="page" style="padding-top:10px">' + sub + notice + '<div class="notice bad">ครูลบข้อสอบนี้แล้ว คำตอบที่บันทึกไว้จะถูกส่งให้ครู</div><div style="margin-top:16px"><button class="btn block" data-act="submit">ส่งเท่าที่ทำ</button></div></main>';
  var list = ordered(ex), total = list.length;
  if (R.cur >= total) R.cur = Math.max(0, total - 1);
  var answered = list.filter(function (q) { return att.answers[q.id] !== undefined; }).length;
  var pct = total ? Math.round(answered / total * 100) : 0;
  var prog = '<div class="progress" role="img" aria-label="ตอบแล้ว ' + answered + ' จาก ' + total + ' ข้อ"><i style="width:' + pct + '%"></i></div>';
  var body;
  if (R.review) {
    var un = 0;
    var grid = list.map(function (q, i) { var a = att.answers[q.id] !== undefined; if (!a) un++; return '<button class="qn' + (a ? ' ans' : '') + '" data-act="goto" data-i="' + i + '" aria-label="ข้อ ' + (i + 1) + (a ? ' ตอบแล้ว' : ' ยังไม่ได้ตอบ') + '">' + (i + 1) + '</button>'; }).join('');
    body = '<div class="sheet"><h2 class="sheet-h">ตรวจทานก่อนส่ง</h2><p class="muted" style="margin-top:6px">' + (un ? 'ยังไม่ได้ตอบ ' + un + ' ข้อ แตะหมายเลขข้อเพื่อกลับไปตอบ' : 'ตอบครบทุกข้อแล้ว') + '</p><div class="qgrid">' + grid + '</div><div class="navrow"><button class="btn ghost" data-act="unreview">กลับไปทำต่อ</button><button class="btn accent" data-act="submit">ส่งข้อสอบ</button></div></div>';
  } else {
    var q = list[R.cur];
    if (!q) return veil + bar + '<main class="page" style="padding-top:10px">' + sub + '<div class="empty">ข้อสอบนี้ยังไม่มีคำถาม</div></main>';
    var chosen = att.answers[q.id];
    var idx = q.choices.map(function (_, i) { return i; }); if (ex.shuffle) idx = shuffle(idx, S.who.no + '|' + q.id);
    var opts = idx.map(function (orig, pos) { var on = chosen === orig; return '<label class="opt' + (on ? ' on' : '') + '"><input type="radio" name="ch" value="' + orig + '" data-act="pick"' + (on ? ' checked' : '') + '><span class="bub">' + (LET[pos] || pos + 1) + '</span><span class="otext">' + esc(q.choices[orig]) + '</span></label>'; }).join('');
    var nav = list.map(function (qq, i) { var a = att.answers[qq.id] !== undefined; return '<button class="qn' + (a ? ' ans' : '') + (i === R.cur ? ' cur' : '') + '" data-act="goto" data-i="' + i + '" aria-label="ข้อ ' + (i + 1) + (a ? ' ตอบแล้ว' : '') + '">' + (i + 1) + '</button>'; }).join('');
    var last = R.cur === total - 1;
    body = '<div class="' + (att.proctor ? 'noselect' : '') + '"><div class="qhead"><span class="qno">ข้อ ' + (R.cur + 1) + ' / ' + total + '</span><span>' + (q.pts && q.pts !== 1 ? 'คะแนน ' + q.pts : '') + '</span></div><div class="qtext">' + esc(q.text) + '</div><div class="opts" role="radiogroup">' + opts + '</div>' +
      '<div class="navrow"><button class="btn ghost" data-act="prev"' + (R.cur === 0 ? ' disabled' : '') + '>ก่อนหน้า</button>' + (last ? '<button class="btn accent" data-act="review">ตรวจทานและส่ง</button>' : '<button class="btn" data-act="next">ข้อถัดไป</button>') + '</div></div>' +
      '<div class="qgrid" aria-label="ไปยังข้อ">' + nav + '</div><div style="margin-top:16px"><button class="btn ghost block" data-act="review">ตรวจทานและส่งข้อสอบ</button></div>';
  }
  return veil + bar + '<main class="page" style="padding-top:10px">' + sub + prog + notice + body + '</main>';
}
function doneHTML() {
  var R = S.run, att = R.att, ex = S.exams[R.examId];
  var total = ex ? (ex.questions || []).length : Object.keys(att.answers).length;
  var n = ex ? (ex.questions || []).filter(function (q) { return att.answers[q.id] !== undefined; }).length : total;
  var timedOut = att.events && att.events.length && att.events[att.events.length - 1].t === 'timeout';
  var lv = att.proctor ? '<p class="muted small">บันทึกการออกจากหน้าสอบ ' + leaveCount(att) + ' ครั้ง</p>' : '';
  var row = 'display:flex;justify-content:space-between;padding:12px 0;border-top:1px solid var(--rule)';
  return headerHTML(true) + '<main class="page"><section style="max-width:520px;margin:20px auto 0"><p class="kicker">ส่งข้อสอบแล้ว</p><h1 style="margin:8px 0 6px">เรียบร้อย</h1><p class="muted" style="margin-bottom:20px">' + esc(att.title) + '</p><dl class="stack" style="gap:0;margin:0 0 18px"><div style="' + row + '"><span class="muted">ชื่อ</span><b>' + esc(S.who.name) + '</b></div><div style="' + row + '"><span class="muted">เลขที่</span><b>' + esc(S.who.no) + '</b></div><div style="' + row + '"><span class="muted">ตอบแล้ว</span><b>' + n + ' / ' + total + ' ข้อ</b></div><div style="' + row + ';border-bottom:1px solid var(--rule)"><span class="muted">เวลาส่ง</span><b>' + clock(att.submittedAt) + (timedOut ? ' (หมดเวลา)' : '') + '</b></div></dl>' + lv + '<p class="muted small" style="margin:12px 0 18px">ผลคะแนนจะแจ้งโดยครูผู้สอน</p><div id="sv" class="muted small"></div><button class="btn block" data-act="home">กลับหน้าหลัก</button></section></main>';
}
function afterExam() {
  updateTimer(); setSave(S.run.saveState || 'saved');
  if (!S.tm) S.tm = setInterval(tick, 1000);
}
/* Countdown: whole minutes while more than a minute remains, seconds only in the last minute. */
function timerLabel(left) {
  if (left <= 0) return '0:00';
  if (left > 60000) return Math.ceil(left / 60000) + ' นาที';
  var s = Math.ceil(left / 1000); return '0:' + pad(s);
}
function updateTimer() {
  var R = S.run; if (!R) return; var el = document.getElementById('tmr'); if (!el) return;
  var left = R.att.endAt - Date.now();
  var label = timerLabel(left);
  if (el.textContent !== label) el.textContent = label;
  var low = left <= 60000;
  if (el.classList.contains('low') !== low) el.classList.toggle('low', low);
}
function tick() {
  var R = S.run;
  if (!R || R.att.status === 'submitted') { clearInterval(S.tm); S.tm = null; return; }
  updateTimer();
  if (R.att.endAt - Date.now() <= 0) submitExam('timeout');
}
function setSave(s) {
  if (S.run) S.run.saveState = s;
  var el = document.getElementById('sv'); if (!el) return;
  var t = s === 'saving' ? 'กำลังบันทึก…' : s === 'error' ? 'บันทึกไม่ได้ ระบบจะลองใหม่อัตโนมัติ' : 'บันทึกแล้ว';
  if (el.textContent !== t) el.textContent = t;
  el.style.color = s === 'error' ? 'var(--bad)' : '';
}
function endRun() {
  clearInterval(S.tm); S.tm = null; S.away = false; exitFs(); S.run = null;
}

/* ---------- student: attempt logic ---------- */
function reqFs() {
  try { var p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (p && p.then) return p.then(function () { return true; }, function () { return false; }); } catch (e) {}
  return Promise.resolve(false);
}
function exitFs() { try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {} }

async function startAttempt(id, preview) {
  var ex = S.exams[id]; if (!ex) return;
  if (!preview && !whoOk()) return;
  var now = Date.now(), att, fsP = (ex.proctor && !preview) ? reqFs() : Promise.resolve(false);
  if (!preview) {
    S.who.name = S.who.name.trim(); S.who.no = String(S.who.no).trim();
    put('omr.who', JSON.stringify(S.who));
    try {
      var r = await api('start', { examId: id, no: S.who.no, name: S.who.name });
      att = r.attempt;
      S.lobby = null;
    } catch (e) {
      if (e.code === 'submitted' && e.attempt) { S.me[id] = e.attempt; S.meSig = ''; }
      if (e.code === 'closed') await loadExams();
      if (e.code === 'ended') S.lobby = null;
      toast(msgOf(e.code));
      render();
      return;
    }
  } else {
    att = { examId: id, title: ex.title, startedAt: now, endAt: now + (Number(ex.minutes) || 30) * 60000, status: 'doing', proctor: !!ex.proctor, answers: {}, events: [{ t: 'start', at: now }] };
  }
  S.run = { examId: id, att: att, cur: 0, review: false, fs: false, needFs: false, notice: null, saveState: 'saved', sig: String(ex.updatedAt), preview: !!preview };
  S.away = false;
  render();
  var fs = await fsP;
  if (S.run && S.run.examId === id) {
    S.run.fs = !!fs;
    if (!fs && ex.proctor && !preview) { S.run.needFs = true; render(); }
  }
  if (!preview && Date.now() >= att.endAt) submitExam('timeout');
}

function logEv(t, extra) {
  var R = S.run; if (!R || R.att.status === 'submitted') return;
  var ev = { t: t, at: Date.now() }; if (extra) for (var k in extra) ev[k] = extra[k];
  var evs = R.att.events; evs.push(ev);
  if (evs.length > 400) evs.splice(1, evs.length - 400);
  var el = document.getElementById('lvc'); if (el) el.textContent = leaveCount(R.att);
  queueFlush(800);
}
function checkPresence() {
  var R = S.run; if (!R || R.att.status === 'submitted') return;
  var gone = document.hidden || !document.hasFocus();
  if (gone && !S.away) {
    S.away = true; S.awaySince = Date.now(); R.att.status = 'away';
    logEv('leave', { r: document.hidden ? 'hidden' : 'blur' });
  } else if (!gone && S.away) {
    S.away = false; var d = Date.now() - S.awaySince; R.att.status = 'doing';
    var evs = R.att.events, last = evs[evs.length - 1];
    if (last && last.t === 'leave' && last.r === 'blur' && d < 1000) { evs.pop(); queueFlush(800); return; }
    logEv('return', { d: d });
    if (R.att.proctor && !R.preview) { R.notice = 'ระบบบันทึกว่าคุณออกจากหน้าสอบ ' + dur(d) + ' (ตั้งแต่เวลา ' + clock(S.awaySince) + ') ครูสามารถดูรายการนี้ได้'; render(); }
  }
}
document.addEventListener('visibilitychange', checkPresence);
window.addEventListener('blur', checkPresence);
window.addEventListener('focus', checkPresence);
window.addEventListener('pagehide', function () {
  var R = S.run;
  if (!R || R.preview || R.att.status === 'submitted') return;
  if (!S.away) { S.away = true; R.att.status = 'away'; logEv('leave', { r: 'hidden' }); }
  else R.att.status = 'away';
  if (navigator.sendBeacon) {
    try { navigator.sendBeacon(API_URL, JSON.stringify(Object.assign({ action: 'save', status: 'away' }, payloadOf(R)))); } catch (e) {}
  }
});
document.addEventListener('fullscreenchange', function () {
  var R = S.run; if (!R || R.att.status === 'submitted' || !R.att.proctor || !R.fs || R.preview) return;
  if (!document.fullscreenElement) { logEv('fs_exit'); R.needFs = true; render(); }
});
['copy', 'cut', 'paste', 'contextmenu'].forEach(function (n) {
  document.addEventListener(n, function (e) {
    var R = S.run; if (!R || R.att.status === 'submitted' || !R.att.proctor) return;
    var tgt = e.target; if (tgt && tgt.closest && tgt.closest('#app') === null) return;
    e.preventDefault();
    var t = n === 'paste' ? 'paste' : n === 'contextmenu' ? 'menu' : 'copy', now = Date.now();
    if (!S.lastBlock[t] || now - S.lastBlock[t] > 2000) { S.lastBlock[t] = now; logEv(t); }
  });
});

/* ---------- saving to the server ---------- */
var flushTimer = null;
function queueFlush(ms) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, ms); }
function payloadOf(R, kind) {
  return { examId: R.examId, no: S.who.no, name: S.who.name, answers: R.att.answers, events: R.att.events.slice(-300), status: S.away ? 'away' : 'doing', kind: kind || undefined };
}
async function flush() {
  var R = S.run; if (!R || R.preview) return;
  if (S.writing) { S.again = true; return; }
  S.writing = true; setSave('saving');
  try {
    do {
      S.again = false;
      var r = await api('save', payloadOf(R));
      if (r.attempt && r.attempt.status === 'submitted' && R.att.status !== 'submitted') {
        R.att.status = 'submitted'; R.att.submittedAt = r.attempt.submittedAt; render();
      }
    } while (S.again);
    setSave('saved');
  } catch (err) {
    if (err.code === 'reset') { endRun(); render(); toast('ครูให้ทำข้อสอบใหม่แล้ว กรุณาเริ่มใหม่'); }
    else { setSave('error'); clearTimeout(S.retry); S.retry = setTimeout(flush, 5000); }
  } finally { S.writing = false; }
}
async function submitExam(kind) {
  var R = S.run; if (!R || R.att.status === 'submitted') return;
  var now = Date.now();
  R.att.events.push({ t: kind === 'timeout' ? 'timeout' : 'submit', at: now });
  R.att.status = 'submitted'; R.att.submittedAt = now;
  S.away = false; R.needFs = false; R.notice = null;
  clearInterval(S.tm); S.tm = null; exitFs();
  if (R.preview) { S.run = null; render(); toast('จบการดูตัวอย่างแล้ว ไม่มีการบันทึกผล'); return; }
  clearTimeout(flushTimer);
  render();
  await sendSubmit(R, kind);
}
async function sendSubmit(R, kind) {
  for (var i = 0; i < 120; i++) {           // ลองส่งซ้ำจนสำเร็จ (ประมาณ 10 นาที)
    try { await api('submit', payloadOf(R, kind)); setSave('saved'); return; }
    catch (e) {
      if (e.code === 'reset') return;
      setSave('error');
      await new Promise(function (res) { setTimeout(res, 5000); });
    }
  }
}

/* ---------- teacher: shared calc ---------- */
function awayStats(att, now) {
  var n = 0, ms = 0, open = null;
  (att.events || []).forEach(function (e) {
    if (e.t === 'leave') { n++; open = e.at; }
    else if (open != null && (e.t === 'return' || e.t === 'rejoin' || e.t === 'submit' || e.t === 'timeout')) { ms += e.at - open; open = null; }
  });
  var ong = open != null && att.status === 'away';
  return { n: n, ms: ms + (ong ? now - open : 0), ongoing: ong, since: open };
}
function scoreOf(att, ex, key) {
  if (!ex || !key || !key.answers) return null;
  var s = 0, max = 0;
  (ex.questions || []).forEach(function (q) { var p = Number(q.pts) || 1; max += p; if (att.answers && att.answers[q.id] !== undefined && key.answers[q.id] === att.answers[q.id]) s += p; });
  return { s: s, max: max };
}
function statusChip(att, as) {
  if (att.status === 'waiting') return '<span class="state plain">ในห้องรอ</span>';
  if (att.status === 'submitted') return '<span class="state done">ส่งแล้ว</span>';
  if (att.status === 'away') return '<span class="state away">ออกจากหน้าสอบ' + (as && as.ongoing ? ' ' + dur(Date.now() - as.since) : '') + '</span>';
  return '<span class="state doing">กำลังทำ</span>';
}
function roster() {
  var id = S.examSel, out = [];
  S.attempts.forEach(function (a) {
    if (a.examId === id) out.push({ uid: String(a.no), no: Number(a.no) || 0, name: a.name || '', att: a });
  });
  out.sort(function (x, y) { return x.no - y.no || x.name.localeCompare(y.name, 'th'); });
  return out;
}
function attOf(uid) {
  var r = S.attempts.filter(function (a) { return a.examId === S.examSel && String(a.no) === String(uid); });
  return r[0] || null;
}

/* ---------- teacher: live ---------- */
function liveHTML() {
  var ex = examsSorted();
  if (!ex.length) return '<div class="head"><div><p class="kicker">ผลสด</p><h1 style="margin-top:6px">ยังไม่มีข้อสอบ</h1></div></div><div class="empty"><p style="margin-bottom:14px">สร้างข้อสอบก่อน เมื่อนักเรียนเริ่มทำ ข้อมูลจะขึ้นที่หน้านี้</p><button class="btn" data-act="area" data-v="exams">ไปที่ข้อสอบ</button></div>';
  if (!S.examSel || !S.exams[S.examSel]) S.examSel = ex[0].id;
  var opts = ex.map(function (e) { return '<option value="' + e.id + '"' + (e.id === S.examSel ? ' selected' : '') + '>' + esc(e.title) + (e.open ? '' : ' (ปิดรับอยู่)') + '</option>'; }).join('');
  return '<div class="head"><div><p class="kicker">ผลสด</p><h1 style="margin-top:6px">ติดตามการทำข้อสอบ</h1><p>อัปเดตเองอัตโนมัติ แตะชื่อเพื่อดูบันทึกเวลาของนักเรียนคนนั้น</p></div><button class="btn ghost sm" data-act="csv">ส่งออก CSV</button></div>' +
    '<div class="toolbar"><label class="field"><span>ข้อสอบ</span><select id="sel-exam">' + opts + '</select></label><button class="btn sm" data-act="golive" data-id="' + S.examSel + '" data-v="' + (S.exams[S.examSel].liveAt ? '0' : '1') + '">' + (S.exams[S.examSel].liveAt ? 'จบการสอบพร้อมกัน' : 'เริ่มสอบพร้อมกัน') + '</button></div>' +
    '<div class="sumrow" id="liveSum"></div><div class="tablewrap"><table class="tbl"><thead><tr><th>เลขที่</th><th>ชื่อ-สกุล</th><th>สถานะ</th><th>ตอบแล้ว</th><th>ออกจากหน้าสอบ</th><th>เริ่ม</th><th>ส่งเมื่อ</th><th>คะแนน</th></tr></thead><tbody id="liveBody"></tbody></table></div><div id="liveDetail"></div>';
}
function renderLiveParts() {
  var body = document.getElementById('liveBody'); if (!body) return;
  var ex = S.exams[S.examSel], key = S.keys[S.examSel], rows = roster(), now = Date.now();
  var c = { all: rows.length, doing: 0, away: 0, done: 0, flag: 0, wait: 0 };
  var html = rows.map(function (r) {
    var as = awayStats(r.att, now);
    if (r.att.status === 'submitted') c.done++; else if (r.att.status === 'away') c.away++; else if (r.att.status === 'waiting') c.wait++; else c.doing++;
    if (as.n > 0) c.flag++;
    var total = ex ? (ex.questions || []).length : 0, ans = ex ? (ex.questions || []).filter(function (q) { return r.att.answers && r.att.answers[q.id] !== undefined; }).length : 0;
    var sc = r.att.status === 'submitted' ? scoreOf(r.att, ex, key) : null;
    var awayTxt = as.n ? '<span class="state ' + (as.n >= 3 ? 'bad' : 'away') + '">' + as.n + ' ครั้ง · รวม ' + dur(as.ms) + '</span>' : '<span class="muted">ไม่มี</span>';
    return '<tr data-act="detail" data-uid="' + esc(r.uid) + '"' + (S.detail === r.uid ? ' class="sel"' : '') + '><td data-label="เลขที่">' + (r.no || '-') + '</td><td class="wide" data-label="ชื่อ-สกุล"><button class="linkbtn" data-act="detail" data-uid="' + esc(r.uid) + '">' + esc(r.name) + '</button></td><td data-label="สถานะ">' + statusChip(r.att, as) + '</td><td data-label="ตอบแล้ว">' + ans + ' / ' + total + '</td><td data-label="ออกจากหน้าสอบ">' + awayTxt + '</td><td data-label="เริ่ม">' + (r.att.startedAt ? clock(r.att.startedAt) : '—') + '</td><td data-label="ส่งเมื่อ">' + (r.att.submittedAt ? clock(r.att.submittedAt) : '—') + '</td><td data-label="คะแนน">' + (sc ? '<b>' + sc.s + '</b> / ' + sc.max : '—') + '</td></tr>';
  }).join('');
  body.innerHTML = html || '<tr><td colspan="8" class="muted" style="padding:30px 0">ยังไม่มีนักเรียนเริ่มทำข้อสอบนี้</td></tr>';
  document.getElementById('liveSum').innerHTML = [['ทั้งหมด', c.all], ['ในห้องรอ', c.wait], ['กำลังทำ', c.doing], ['ออกจากหน้าสอบอยู่', c.away], ['ส่งแล้ว', c.done], ['เคยออกจากหน้าสอบ', c.flag]].map(function (x) { return '<div class="sum"><b>' + x[1] + '</b><span>' + x[0] + '</span></div>'; }).join('');
  var dv = document.getElementById('liveDetail'); if (dv) dv.innerHTML = S.detail ? detailHTML(S.detail, now) : '';
}
function evLabel(e) {
  switch (e.t) {
    case 'start': return ['เริ่มทำข้อสอบ', 0];
    case 'rejoin': return ['เปิดหน้าสอบอีกครั้ง (รีเฟรชหรือเปิดแอปใหม่)', 1];
    case 'leave': return [e.r === 'hidden' ? 'ออกจากหน้าสอบ (สลับแอป แท็บ พับจอ หรือปิดแอป)' : 'หน้าต่างสอบเสียโฟกัส (มีหน้าต่างอื่นทับ)', 1];
    case 'return': return ['กลับเข้าหน้าสอบ' + (e.d != null ? ' · ออกไป ' + dur(e.d) : ''), 0];
    case 'fs_exit': return ['ออกจากโหมดเต็มจอ', 1];
    case 'copy': return ['พยายามคัดลอกข้อความ', 1];
    case 'paste': return ['พยายามวางข้อความ', 1];
    case 'menu': return ['คลิกขวา', 1];
    case 'submit': return ['ส่งข้อสอบ', 0];
    case 'timeout': return ['หมดเวลา ระบบส่งให้อัตโนมัติ', 0];
  }
  return [e.t, 0];
}
function detailHTML(uid, now) {
  var a = attOf(uid); if (!a) return '';
  var ex = S.exams[S.examSel], key = S.keys[S.examSel], as = awayStats(a, now), sc = a.status === 'submitted' ? scoreOf(a, ex, key) : null;
  var tl = (a.events || []).map(function (e) { var l = evLabel(e); return '<li' + (l[1] ? ' class="w"' : '') + '><time>' + clock(e.at) + '</time><span>' + esc(l[0]) + '</span></li>'; }).join('');
  var strip = '';
  if (ex) {
    strip = (ex.questions || []).map(function (q, i) {
      var got = a.answers && a.answers[q.id], cls = '', tip = 'ไม่ได้ตอบ';
      if (got !== undefined) {
        if (key && key.answers && key.answers[q.id] !== undefined) { cls = key.answers[q.id] === got ? ' r' : ' w'; tip = 'ตอบ ' + (LET[got] || got + 1) + ' · เฉลย ' + (LET[key.answers[q.id]] || '?'); }
        else tip = 'ตอบ ' + (LET[got] || got + 1);
      }
      return '<span class="sq' + cls + '" title="ข้อ ' + (i + 1) + ': ' + tip + '">' + (i + 1) + '</span>';
    }).join('');
  }
  var rst = S.confirmReset === uid ? '<button class="btn danger sm" data-act="resetyes" data-uid="' + esc(uid) + '">ยืนยันล้างผล</button><button class="btn ghost sm" data-act="resetno">ยกเลิก</button>' : '<button class="btn ghost sm" data-act="reset" data-uid="' + esc(uid) + '">ให้ทำใหม่</button>';
  return '<section class="detail"><div class="dhead"><div><p class="kicker">รายละเอียด</p><h2 style="margin-top:6px">' + esc(a.name) + ' · เลขที่ ' + esc(a.no) + '</h2><p class="muted small" style="margin-top:4px">' + (a.startedAt ? 'เริ่มเมื่อ ' + fmtDay(a.startedAt) : 'ยังอยู่ในห้องรอ') + ' · ใช้เวลา ' + (a.endAt ? dur(a.endAt - a.startedAt) : '-') + '</p></div><div class="row" style="gap:10px;align-items:center">' + statusChip(a, as) + (sc ? '<span class="tag">คะแนน ' + sc.s + ' / ' + sc.max + '</span>' : '') + rst + '<button class="btn ghost sm" data-act="closedetail">ปิด</button></div></div>' +
    '<div class="dgrid"><div><h3 style="margin-bottom:8px">บันทึกเวลา</h3><p class="small muted" style="margin-bottom:10px">ออกจากหน้าสอบ ' + as.n + ' ครั้ง รวม ' + dur(as.ms) + '</p><ol class="tl">' + (tl || '<li>ยังไม่มีบันทึก</li>') + '</ol></div>' +
    '<div><h3 style="margin-bottom:8px">คำตอบรายข้อ</h3><div class="strip">' + strip + '</div><div class="legend"><span><i style="background:var(--ok)"></i>ตอบถูก</span><span><i style="background:var(--bad)"></i>ตอบผิด</span><span><i></i>ไม่ได้ตอบ</span></div></div></div></section>';
}
function fmtDay(ms) { var d = new Date(ms); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ' + clock(ms); }
async function resetAttempt(uid) {
  try {
    await api('teacher', { op: 'reset', token: S.token, examId: S.examSel, no: uid });
    S.confirmReset = null; S.detail = null;
    toast('ล้างผลแล้ว นักเรียนทำข้อสอบใหม่ได้');
    await loadTeacher();
  } catch (e) { toast('ล้างผลไม่สำเร็จ ลองอีกครั้ง'); }
  if (document.getElementById('liveBody')) renderLiveParts();
}
function exportCsv() {
  var ex = S.exams[S.examSel], key = S.keys[S.examSel], rows = roster(), now = Date.now();
  var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  var lines = [['เลขที่', 'ชื่อ-สกุล', 'สถานะ', 'ตอบแล้ว', 'ออกจากหน้าสอบ(ครั้ง)', 'เวลารวมที่ออก(วินาที)', 'เริ่ม', 'ส่งเมื่อ', 'คะแนน', 'คะแนนเต็ม'].map(q).join(',')];
  rows.forEach(function (r) {
    var as = awayStats(r.att, now), sc = r.att.status === 'submitted' ? scoreOf(r.att, ex, key) : null;
    var ans = ex ? (ex.questions || []).filter(function (x) { return r.att.answers && r.att.answers[x.id] !== undefined; }).length : '';
    lines.push([r.no, r.name, r.att.status === 'submitted' ? 'ส่งแล้ว' : r.att.status === 'away' ? 'ออกจากหน้าสอบอยู่' : r.att.status === 'waiting' ? 'ในห้องรอ' : 'กำลังทำ', ans, as.n, Math.round(as.ms / 1000), r.att.startedAt ? fmtDay(r.att.startedAt) : '', r.att.submittedAt ? fmtDay(r.att.submittedAt) : '', sc ? sc.s : '', sc ? sc.max : ''].map(q).join(','));
  });
  try {
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'ผลสอบ-' + (ex ? ex.title : 'ข้อสอบ').replace(/[\\/:*?"<>|]/g, '') + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    toast('ส่งออกไฟล์แล้ว');
  } catch (e) { toast('ส่งออกไฟล์ไม่สำเร็จ'); }
}

/* ---------- teacher: exams list + editor ---------- */
function examsHTML() {
  var ex = examsSorted();
  var list = ex.map(function (e) {
    var n = (e.questions || []).length;
    var del = S.confirmDel === e.id ? '<button class="btn danger sm" data-act="delyes" data-id="' + e.id + '">ยืนยันลบ</button><button class="btn ghost sm" data-act="delno">ยกเลิก</button>' : '<button class="btn ghost sm" data-act="del" data-id="' + e.id + '">ลบ</button>';
    return '<article class="exrow"><div class="exinfo"><h3>' + esc(e.title) + '</h3><div class="exmeta"><span class="state ' + (e.open ? 'done' : 'plain') + '">' + (e.open ? 'เปิดรับอยู่' : 'ปิดรับอยู่') + '</span><span>·</span><span>' + n + ' ข้อ</span><span>·</span><span>' + (e.minutes || 0) + ' นาที</span>' + (e.proctor ? '<span>·</span><span>โหมดคุมสอบ</span>' : '') + (e.shuffle ? '<span>·</span><span>สลับข้อ</span>' : '') + '</div></div><div class="exact"><button class="btn sm" data-act="golive" data-id="' + e.id + '" data-v="' + (e.liveAt ? '0' : '1') + '">' + (e.liveAt ? 'จบการสอบพร้อมกัน' : 'เริ่มสอบพร้อมกัน') + '</button><button class="btn sm" data-act="toggleopen" data-id="' + e.id + '">' + (e.open ? 'ปิดรับ' : 'เปิดรับ') + '</button><button class="btn ghost sm" data-act="edit" data-id="' + e.id + '">แก้ไข</button><button class="btn ghost sm" data-act="preview" data-id="' + e.id + '">ดูตัวอย่าง</button><button class="btn ghost sm" data-act="track" data-id="' + e.id + '">ผลสด</button>' + del + '</div></article>';
  }).join('');
  return '<div class="head"><div><p class="kicker">ข้อสอบ</p><h1 style="margin-top:6px">รายการข้อสอบ</h1><p>แก้ไขได้ตลอด นักเรียนที่เปิดหน้าอยู่จะเห็นการเปลี่ยนแปลงภายในไม่กี่วินาที</p></div><button class="btn accent" data-act="newexam">สร้างข้อสอบ</button></div>' + (list ? '<div class="exlist2">' + list + '</div>' : '<div class="empty">ยังไม่มีข้อสอบ กด “สร้างข้อสอบ” เพื่อเริ่มต้น</div>');
}
function blankQ() { return { id: nid('q'), text: '', choices: ['', '', '', ''], ans: 0, pts: 1 }; }
function newDraft() { return { id: nid('e'), title: '', minutes: 30, proctor: true, shuffle: false, open: false, questions: [blankQ()], isNew: true }; }
function draftFrom(id) {
  var e = S.exams[id], k = (S.keys[id] && S.keys[id].answers) || {};
  return { id: id, title: e.title, minutes: e.minutes || 30, proctor: !!e.proctor, shuffle: !!e.shuffle, open: !!e.open, questions: (e.questions || []).map(function (q) { return { id: q.id, text: q.text, choices: q.choices.slice(), ans: k[q.id] != null ? k[q.id] : 0, pts: q.pts || 1 }; }) };
}
function editorHTML() {
  var D = S.editing;
  var qs = D.questions.map(function (q, qi) {
    var cs = q.choices.map(function (c, ci) {
      return '<div class="crow"><input type="radio" name="ans' + qi + '" data-k="ans" data-qi="' + qi + '" data-ci="' + ci + '"' + (q.ans === ci ? ' checked' : '') + ' aria-label="ตัวเลือก ' + (LET[ci] || ci + 1) + ' คือเฉลย"><span class="lt">' + (LET[ci] || ci + 1) + '</span><input type="text" data-k="c-text" data-qi="' + qi + '" data-ci="' + ci + '" value="' + esc(c) + '" placeholder="ตัวเลือก ' + (LET[ci] || ci + 1) + '" aria-label="ตัวเลือก ' + (LET[ci] || ci + 1) + '" style="border-bottom-width:1px">' + (q.choices.length > 2 ? '<button class="btn ghost sm" data-act="delc" data-qi="' + qi + '" data-ci="' + ci + '" aria-label="ลบตัวเลือก">ลบ</button>' : '') + '</div>';
    }).join('');
    return '<div class="qcard2"><div class="qhead2"><h3>ข้อที่ ' + (qi + 1) + '</h3><div class="btns"><button class="btn ghost sm" data-act="upq" data-qi="' + qi + '"' + (qi === 0 ? ' disabled' : '') + '>ขึ้น</button><button class="btn ghost sm" data-act="downq" data-qi="' + qi + '"' + (qi === D.questions.length - 1 ? ' disabled' : '') + '>ลง</button><button class="btn danger sm" data-act="delq" data-qi="' + qi + '"' + (D.questions.length === 1 ? ' disabled' : '') + '>ลบข้อนี้</button></div></div>' +
      '<label class="field"><span>โจทย์</span><textarea data-k="q-text" data-qi="' + qi + '" placeholder="พิมพ์คำถาม">' + esc(q.text) + '</textarea></label>' +
      '<div class="field"><span>ตัวเลือก (วงกลมที่เลือกคือเฉลย)</span><div class="stack" style="gap:10px">' + cs + '</div></div>' +
      '<div class="row" style="align-items:center">' + (q.choices.length < 6 ? '<button class="btn ghost sm" data-act="addc" data-qi="' + qi + '">+ ตัวเลือก</button>' : '') + '<label class="field ptsbox"><span>คะแนน</span><input type="number" min="0" step="0.5" data-k="q-pts" data-qi="' + qi + '" value="' + esc(q.pts) + '"></label></div></div>';
  }).join('');
  return '<div class="head"><div><p class="kicker">' + (D.isNew ? 'ข้อสอบใหม่' : 'แก้ไขข้อสอบ') + '</p><h1 style="margin-top:6px">' + (D.isNew ? 'สร้างข้อสอบ' : esc(D.title || 'ไม่มีชื่อ')) + '</h1></div></div><div class="stack">' +
    '<section class="stack" style="gap:14px"><div class="row"><label class="field" style="flex:3 1 260px"><span>ชื่อข้อสอบ</span><input id="e-title" type="text" data-k="f-title" maxlength="80" value="' + esc(D.title) + '" placeholder="เช่น สอบกลางภาค วิทยาศาสตร์ ม.2"></label><label class="field" style="flex:1 1 110px"><span>เวลา (นาที)</span><input id="e-min" type="number" min="1" max="600" data-k="f-min" value="' + esc(D.minutes) + '"></label></div>' +
    '<label class="check"><input type="checkbox" data-k="f-open"' + (D.open ? ' checked' : '') + '><span><b>เปิดรับนักเรียน</b><span class="hint">นักเรียนจะเห็นและเริ่มทำได้ทันที</span></span></label>' +
    '<label class="check"><input type="checkbox" data-k="f-proctor"' + (D.proctor ? ' checked' : '') + '><span><b>โหมดคุมสอบ</b><span class="hint">บันทึกการออกจากหน้าสอบ เต็มจอ และการคัดลอก วาง</span></span></label>' +
    '<label class="check"><input type="checkbox" data-k="f-shuffle"' + (D.shuffle ? ' checked' : '') + '><span><b>สลับลำดับข้อและตัวเลือก</b><span class="hint">นักเรียนแต่ละคนจะเห็นลำดับไม่เหมือนกัน</span></span></label></section>' +
    '<div class="sec-title">คำถาม · ' + D.questions.length + ' ข้อ</div>' + qs + '<div><button class="btn ghost block" data-act="addq">+ เพิ่มข้อ</button></div>' +
    (S.editErr ? '<div class="notice bad" role="alert">' + esc(S.editErr) + '</div>' : '') +
    '<div class="savebar"><button class="btn accent" style="flex:1 1 auto" data-act="save"' + (S.saving ? ' disabled' : '') + '>' + (S.saving ? 'กำลังบันทึก…' : 'บันทึกข้อสอบ') + '</button><button class="btn ghost" data-act="cancel">ยกเลิก</button></div></div>';
}
function validateDraft(D) {
  if (!D.title.trim()) return 'กรุณาใส่ชื่อข้อสอบ';
  var m = Number(D.minutes); if (!(m >= 1 && m <= 600)) return 'เวลาสอบต้องอยู่ระหว่าง 1 ถึง 600 นาที';
  for (var i = 0; i < D.questions.length; i++) {
    var q = D.questions[i];
    if (!q.text.trim()) return 'ข้อที่ ' + (i + 1) + ' ยังไม่มีโจทย์';
    var filled = q.choices.filter(function (c) { return c.trim(); });
    if (filled.length < 2) return 'ข้อที่ ' + (i + 1) + ' ต้องมีตัวเลือกอย่างน้อย 2 ตัว';
    if (!q.choices[q.ans] || !q.choices[q.ans].trim()) return 'ข้อที่ ' + (i + 1) + ' เฉลยชี้ไปที่ตัวเลือกที่ยังว่างอยู่';
    if (!(Number(q.pts) >= 0)) return 'ข้อที่ ' + (i + 1) + ' คะแนนไม่ถูกต้อง';
  }
  return null;
}
async function saveExam() {
  var D = S.editing, err = validateDraft(D);
  if (err) { S.editErr = err; render(); return; }
  S.saving = true; S.editErr = null; render();
  var answers = {}, qs = D.questions.map(function (q) {
    var map = [], cs = [];
    q.choices.forEach(function (c, i) { if (c.trim()) { map[i] = cs.length; cs.push(c.trim()); } });
    answers[q.id] = map[q.ans];
    return { id: q.id, text: q.text.trim(), choices: cs, pts: Number(q.pts) };
  });
  try {
    await api('teacher', { op: 'saveExam', token: S.token, answers: answers, exam: { id: D.id, title: D.title.trim(), minutes: Math.round(Number(D.minutes)), proctor: !!D.proctor, shuffle: !!D.shuffle, open: !!D.open, questions: qs } });
    S.saving = false; S.editing = null; S.examSel = D.id; S.examsSig = '';
    await loadExams(); await loadTeacher();
    render(); toast('บันทึกข้อสอบแล้ว');
  } catch (e) {
    S.saving = false;
    S.editErr = e.code === 'network' ? 'บันทึกไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง' : e.code === 'unauthorized' ? 'รหัสผู้สอนไม่ถูกต้อง กรุณาเข้าระบบใหม่' : 'บันทึกไม่สำเร็จ: ' + (e.message || e.code);
    render();
  }
}
async function deleteExam(id) {
  try {
    await api('teacher', { op: 'deleteExam', token: S.token, examId: id });
    if (S.examSel === id) S.examSel = null;
    S.examsSig = ''; await loadExams(); await loadTeacher(); render();
    toast('ลบข้อสอบแล้ว');
  } catch (e) { toast('ลบไม่สำเร็จ'); }
}
async function toggleOpen(id) {
  var cur = S.exams[id]; if (!cur) return;
  try {
    await api('teacher', { op: 'toggleOpen', token: S.token, examId: id, open: !cur.open });
    S.examsSig = ''; await loadExams(); render();
    toast(cur.open ? 'ปิดรับแล้ว' : 'เปิดรับแล้ว นักเรียนเห็นทันที');
  } catch (e) { toast('เปลี่ยนสถานะไม่สำเร็จ'); }
}
async function setLive(id, on) {
  try {
    await api('teacher', { op: 'setLive', token: S.token, examId: id, live: on });
    S.examsSig = ''; await loadExams(); render();
    toast(on ? 'เริ่มสอบแล้ว นักเรียนในห้องรอจะเข้าสอบได้ทันที' : 'ยกเลิกการเริ่มสอบพร้อมกันแล้ว');
  } catch (e) { toast(e.code === 'unauthorized' ? 'รหัสผู้สอนไม่ถูกต้อง' : 'ทำรายการไม่สำเร็จ ลองอีกครั้ง'); }
}
async function teacherLogin() {
  var el = document.getElementById('f-token'); var t = el ? el.value.trim() : '';
  if (!t) { S.loginErr = 'กรุณาใส่รหัสผู้สอน'; render(); return; }
  S.token = t; S.loginErr = '';
  await loadTeacher();
  if (S.isTeacher) {
    put('hs.token', t); S.intro = false; S.area = 'exams';
    S.examsSig = ''; await loadExams(); render();
  } else {
    S.token = ''; render();
  }
}
function logout() {
  S.isTeacher = false; S.token = ''; put('hs.token', ''); S.attempts = []; S.keys = {};
  S.area = 'student'; S.step = 'name'; S.editing = null; S.detail = null; S.intro = false;
  render();
}

/* ---------- events ---------- */
function act(a, b) {
  var id = b.getAttribute('data-id'), qi = +b.getAttribute('data-qi'), ci = +b.getAttribute('data-ci'), R = S.run, D = S.editing;
  switch (a) {
    case 'area': if (S.editing) return; if (S.run && S.run.att.status === 'submitted') endRun(); S.area = b.getAttribute('data-v'); S.detail = null; render(); break;
    case 'start': startAttempt(id, false); break;
    case 'join': joinLobby(id); break;
    case 'lobby': S.lobby = id; render(); break;
    case 'leavelobby': S.lobby = null; render(); break;
    case 'golive': setLive(id, b.getAttribute('data-v') === '1'); break;
    case 'preview': startAttempt(id, true); break;
    case 'track': S.examSel = id; S.detail = null; S.area = 'live'; render(); break;
    case 'exitpreview': endRun(); render(); break;
    case 'tolist':
      if (whoOk()) { S.step = 'list'; render(); loadStatus().then(function (c) { if (c) refreshView(); }); }
      break;
    case 'editname': S.step = 'name'; S.lobby = null; render(); break;
    case 'skipintro': finishIntro(); break;
    case 'home': endRun(); render(); loadStatus().then(function (c) { if (c) refreshView(); }); break;
    case 'goto': R.cur = +b.getAttribute('data-i'); R.review = false; render(); window.scrollTo(0, 0); break;
    case 'prev': if (R.cur > 0) { R.cur--; render(); window.scrollTo(0, 0); } break;
    case 'next': R.cur++; render(); window.scrollTo(0, 0); break;
    case 'review': R.review = true; render(); window.scrollTo(0, 0); break;
    case 'unreview': R.review = false; render(); break;
    case 'submit': submitExam('manual'); break;
    case 'dismiss': R.notice = null; render(); break;
    case 'fsback': reqFs().then(function (ok) { if (!S.run) return; S.run.needFs = false; S.run.fs = ok; render(); }); break;
    case 'detail': S.detail = b.getAttribute('data-uid'); S.confirmReset = null; renderLiveParts(); var dv = document.getElementById('liveDetail'); if (dv && dv.scrollIntoView) dv.scrollIntoView({ block: 'start', behavior: 'smooth' }); break;
    case 'closedetail': S.detail = null; S.confirmReset = null; renderLiveParts(); break;
    case 'reset': S.confirmReset = b.getAttribute('data-uid'); renderLiveParts(); break;
    case 'resetno': S.confirmReset = null; renderLiveParts(); break;
    case 'resetyes': resetAttempt(b.getAttribute('data-uid')); break;
    case 'csv': exportCsv(); break;
    case 'newexam': S.editing = newDraft(); S.editErr = null; render(); window.scrollTo(0, 0); break;
    case 'edit': S.editing = draftFrom(id); S.editErr = null; render(); window.scrollTo(0, 0); break;
    case 'del': S.confirmDel = id; render(); break;
    case 'delno': S.confirmDel = null; render(); break;
    case 'delyes': S.confirmDel = null; deleteExam(id); break;
    case 'toggleopen': toggleOpen(id); break;
    case 'addq': D.questions.push(blankQ()); render(); break;
    case 'delq': D.questions.splice(qi, 1); render(); break;
    case 'upq': if (qi > 0) { var t = D.questions[qi]; D.questions[qi] = D.questions[qi - 1]; D.questions[qi - 1] = t; render(); } break;
    case 'downq': if (qi < D.questions.length - 1) { var t2 = D.questions[qi]; D.questions[qi] = D.questions[qi + 1]; D.questions[qi + 1] = t2; render(); } break;
    case 'addc': if (D.questions[qi].choices.length < 6) { D.questions[qi].choices.push(''); render(); } break;
    case 'delc':
      var q = D.questions[qi];
      if (q.choices.length > 2) { q.choices.splice(ci, 1); if (q.ans === ci) q.ans = 0; else if (q.ans > ci) q.ans--; render(); }
      break;
    case 'save': saveExam(); break;
    case 'cancel': S.editing = null; S.editErr = null; render(); break;
    case 'teacherlogin': S.area = 'login'; S.loginErr = ''; render(); break;
    case 'cancellogin': S.area = 'student'; S.loginErr = ''; render(); break;
    case 'teachersubmit': teacherLogin(); break;
    case 'logout': logout(); break;
  }
}
app.addEventListener('click', function (e) {
  var b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT' || b.disabled) return;
  act(b.getAttribute('data-act'), b);
});
app.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && e.target && e.target.id === 'f-token') teacherLogin();
});
app.addEventListener('change', function (e) {
  var t = e.target;
  if (t.getAttribute('data-act') === 'pick' && S.run) {
    var R = S.run, ex = S.exams[R.examId];
    if (!ex || R.att.status === 'submitted') return;
    var list = ordered(ex), q = list[R.cur]; if (!q) return;
    R.att.answers[q.id] = Number(t.value);
    var opts = app.querySelectorAll('.opt');
    for (var i = 0; i < opts.length; i++) { var inp = opts[i].querySelector('input'); opts[i].classList.toggle('on', inp.checked); }
    var qn = app.querySelectorAll('.qgrid .qn'); if (qn[R.cur]) qn[R.cur].classList.add('ans');
    var answered = list.filter(function (qq) { return R.att.answers[qq.id] !== undefined; }).length;
    var bar = app.querySelector('.progress i'); if (bar) bar.style.width = Math.round(answered / list.length * 100) + '%';
    setSave('saving'); queueFlush(1200);
  }
  if (t.id === 'sel-exam') { S.examSel = t.value; S.detail = null; renderLiveParts(); }
  if (t.getAttribute('data-k') === 'ans') { var D = S.editing; if (D && t.checked) D.questions[+t.getAttribute('data-qi')].ans = +t.getAttribute('data-ci'); }
});
app.addEventListener('input', function (e) {
  var t = e.target, k = t.getAttribute && t.getAttribute('data-k'); if (!k) return;
  if (k === 'who-name' || k === 'who-no') {
    if (k === 'who-name') S.who.name = t.value; else S.who.no = t.value;
    put('omr.who', JSON.stringify(S.who)); updateIdGate(); return;
  }
  var D = S.editing; if (!D) return;
  var qi = +t.getAttribute('data-qi'), ci = +t.getAttribute('data-ci');
  switch (k) {
    case 'f-title': D.title = t.value; break;
    case 'f-min': D.minutes = t.value; break;
    case 'f-open': D.open = t.checked; break;
    case 'f-proctor': D.proctor = t.checked; break;
    case 'f-shuffle': D.shuffle = t.checked; break;
    case 'q-text': D.questions[qi].text = t.value; break;
    case 'q-pts': D.questions[qi].pts = t.value; break;
    case 'c-text': D.questions[qi].choices[ci] = t.value; break;
  }
});

boot();
})();
