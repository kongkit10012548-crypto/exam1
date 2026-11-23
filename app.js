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
    empty_roster: 'ไม่พบรายชื่อที่ถูกต้อง',
    bad_room: 'ชื่อห้องไม่ถูกต้อง',
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
  away: false, awaySince: 0, lastBlock: {}, tm: null, retry: null, lobby: null, starting: false,
  book: { roster: [], tasks: [], marks: [] }, bookSig: '', bookRoom: '', bookPanel: null, bookErr: '', bookBusy: false, confirmRoom: false, confirmTask: null
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
  if (S.isTeacher && S.area === 'book' && !S.bookPanel) { if (await loadBook()) ch = true; }
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
  else if (S.area === 'book') { if (!S.bookPanel) { var y = window.scrollY, bs = document.querySelector('.bk-scroll'), bx = bs ? bs.scrollLeft : 0; render(); window.scrollTo(0, y); var bs2 = document.querySelector('.bk-scroll'); if (bs2) bs2.scrollLeft = bx; } }
  else if (S.area === 'student' && S.step === 'list' && whoOk()) {
    if (S.lobby) { render(); return; }
    render();
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
  if (!S.booted) { app.innerHTML = '<div class="boot">' + IC.cap + '<p class="muted">กำลังเชื่อมต่อ…</p></div>'; return; }
  if (S.run) { app.innerHTML = S.run.att.status === 'submitted' ? doneHTML() : examHTML(); if (S.run.att.status !== 'submitted') afterExam(); return; }
  if (S.intro && S.area === 'student') { app.innerHTML = introHTML(); startIntro(); return; }
  var h = '';
  if (S.err) h += '<div class="notice bad" style="margin-bottom:16px">' + esc(msgOf(S.err)) + '</div>';
  if (S.area === 'login') h += loginHTML();
  else if (S.area === 'live') h += liveHTML();
  else if (S.area === 'book') h += bookHTML();
  else if (S.area === 'exams') h += S.editing ? editorHTML() : examsHTML();
  else if (S.step !== 'list' || !whoOk()) h += nameHTML();
  else h += S.lobby ? lobbyHTML() : homeHTML();
  app.innerHTML = shellHTML(h);
  if (S.area === 'live' && document.getElementById('liveBody')) renderLiveParts();
  if (S.area === 'student') updateIdGate();
}
function fatalHTML() {
  return shellHTML('<section class="card" style="max-width:560px"><h2 style="margin-bottom:8px">ยังไม่สามารถเข้าระบบสอบได้</h2><p class="muted">' + msgOf(S.fatal) + '</p></section>', true);
}
var NI = {
  check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4M9 12l2 2 4-4M9 17h6"/></svg>',
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3 2.5 11h2.8v9.5h5.2v-6h3v6h5.2V11h2.8z"/></svg>',
  book: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5z"/></svg>',
  chart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  users: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="8" r="3.6"/><circle cx="17" cy="9" r="2.8"/><path d="M2 20c0-3.6 3.1-6 7-6s7 2.4 7 6zM15.5 14.2c3.4-.4 6.5 1.6 6.5 5.8h-4.5c0-2.3-.7-4.3-2-5.8z"/></svg>',
  key: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/></svg>',
  out: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/></svg>',
  plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  doc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="5" width="14" height="14" rx="2.5"/><path d="M18 9.5 22 7v10l-4-2.5z"/></svg>',
  trophy: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z"/></svg>',
  star: '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z"/></svg>',
  cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h2.5A1.5 1.5 0 0 1 21 5.5v14a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-14A1.5 1.5 0 0 1 4.5 4H7zM5 9v10h14V9zm2 2h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2z"/></svg>',
  arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
};
function leafArt() {
  return '<svg class="leaf" viewBox="0 0 200 200" aria-hidden="true"><path d="M20 200C10 140 30 90 80 70c-10 40-12 90-30 130z" fill="#BFE6CC"/><path d="M60 200c0-60 30-100 90-110-25 30-40 70-50 110z" fill="#9ED9B3"/><path d="M0 200c10-30 30-50 60-55-15 20-22 38-25 55z" fill="#D6F0DF"/></svg>';
}
function shellHTML(inner, plain) {
  var items = '';
  var it = function (act, v, icon, label, cur, extra) { return '<button class="snav' + (cur ? ' on' : '') + '" data-act="' + act + '"' + (v ? ' data-v="' + v + '"' : '') + (cur ? ' aria-current="page"' : '') + (extra || '') + '>' + icon + '<span>' + label + '</span></button>'; };
  if (!plain) {
    if (S.isTeacher) {
      var dis = S.editing ? ' disabled' : '';
      items = it('area', 'exams', NI.home, 'ข้อสอบ', S.area === 'exams', dis) + it('area', 'live', NI.chart, 'ผลสด', S.area === 'live', dis) + it('area', 'book', NI.check, 'ตรวจงาน', S.area === 'book', dis) + it('area', 'student', NI.users, 'หน้านักเรียน', S.area === 'student', dis) +
        '<span class="snav-gap"></span>' + it('logout', '', NI.out, 'ออกจากระบบ');
    } else {
      items = it('home', '', NI.home, 'หน้าหลัก', S.area === 'student') + it('teacherlogin', '', NI.key, 'สำหรับผู้สอน', S.area === 'login');
    }
  }
  var side = '<aside class="side"><div class="side-logo">' + IC.cap + '<b>ห้องสอบ</b><span>ระบบสอบออนไลน์</span></div><nav class="side-nav" aria-label="เมนูหลัก">' + items + '</nav>' + leafArt() + '</aside>';
  var tabs = '';
  if (S.isTeacher && !plain) {
    var d2 = S.editing ? ' disabled' : '';
    var tb = function (v, icon, l) { return '<button class="tab" data-act="area" data-v="' + v + '"' + (S.area === v ? ' aria-current="page"' : '') + d2 + '>' + icon + '<span>' + l + '</span></button>'; };
    tabs = '<nav class="tabbar" aria-label="เมนูผู้สอน">' + tb('exams', NI.home, 'ข้อสอบ') + tb('live', NI.chart, 'ผลสด') + tb('book', NI.check, 'ตรวจงาน') + tb('student', NI.users, 'นักเรียน') + '</nav>';
  }
  var who = S.isTeacher ? '<b>ผู้สอน</b><span>โหมดจัดการข้อสอบ</span>' : (whoOk() && S.step === 'list' ? '<b>' + esc(S.who.name) + '</b><span>เลขที่ ' + esc(S.who.no) + '</span>' : '<b>นักเรียน</b><span>ยังไม่ได้ลงชื่อ</span>');
  var act = plain ? '' : (S.isTeacher ? '<button class="pillbtn" data-act="logout">' + NI.out + '<span>ออก</span></button>' : (S.area === 'login' ? '' : '<button class="pillbtn" data-act="teacherlogin">' + NI.key + '<span>สำหรับผู้สอน</span></button>'));
  var top = '<header class="topbar"><div class="tb-brand">' + IC.cap + '<b>ห้องสอบ</b></div><div class="tb-hello"><span>ระบบสอบออนไลน์</span><b>' + (S.isTeacher ? 'แผงควบคุมผู้สอน' : 'ยินดีต้อนรับสู่ห้องสอบ') + '</b></div><div class="tb-r">' + act + '<span class="tb-who"><span class="tb-av">' + IC.user + '</span><span class="tb-wt">' + who + '</span></span></div></header>';
  return '<div class="shell">' + side + '<div class="shell-main">' + top + '<main class="page">' + inner + '</main></div></div>' + tabs;
}
function headerHTML() { return ''; }

/* ---------- intro countdown, name step, art ---------- */
function ringOff(n) { return (339.292 * (1 - n / 5)).toFixed(1); }
function heroArt() {
  return '<svg class="hero-art" viewBox="0 0 460 260" role="img" aria-label="ภาพประกอบแล็ปท็อป หนังสือ และกราฟ">' +
    '<defs><linearGradient id="hg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CDEFD9"/><stop offset="1" stop-color="#7FCF9B"/></linearGradient><linearGradient id="hg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F4A63"/><stop offset="1" stop-color="#16293D"/></linearGradient><linearGradient id="hg3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5BC0FF"/><stop offset="1" stop-color="#2E7BEA"/></linearGradient></defs>' +
    '<path d="M0 230c80-40 160-50 240-30s150 10 220-20v80H0z" fill="url(#hg1)"/><path d="M0 250c90-25 200-30 300-10s120 5 160-5v25H0z" fill="#9ED9B3"/>' +
    '<ellipse cx="250" cy="226" rx="150" ry="14" fill="#5FAF7B" opacity=".35"/>' +
    '<g transform="rotate(-8 250 140)"><rect x="170" y="52" width="170" height="118" rx="10" fill="#C9D3DC"/><rect x="178" y="60" width="154" height="102" rx="6" fill="url(#hg2)"/><path d="M255 92l30 13-30 13-30-13z" fill="#7CC3FF"/><path d="M237 110v12c0 5 8 9 18 9s18-4 18-9v-12l-18 8z" fill="url(#hg3)"/><circle cx="276" cy="127" r="9" fill="#F3C24E"/><path d="M273 122.5v9l7.5-4.5z" fill="#fff"/></g>' +
    '<path d="M142 190l200-28 26 16-210 32z" fill="#DCE3E9"/><path d="M158 210l210-32v6l-208 32z" fill="#AEB9C3"/>' +
    '<g><rect x="345" y="186" width="96" height="16" rx="3" fill="#2E7BEA"/><rect x="350" y="170" width="88" height="16" rx="3" fill="#F6F1E6" stroke="#E0D6C0"/><rect x="340" y="154" width="92" height="16" rx="3" fill="#2FA866"/><rect x="352" y="138" width="80" height="16" rx="3" fill="#F6F1E6" stroke="#E0D6C0"/></g>' +
    '<g><rect x="112" y="120" width="40" height="72" rx="8" fill="#2FA866"/><path d="M120 120l-4-38M132 120l2-44M144 120l8-34" stroke-width="5" stroke-linecap="round" stroke="#1F2937"/><circle cx="116" cy="80" r="4" fill="#F3C24E"/><circle cx="134" cy="74" r="4" fill="#E2584D"/></g>' +
    '<g><rect x="370" y="20" width="62" height="56" rx="12" fill="#fff" opacity=".9"/><path d="M382 64l12-14 10 8 16-20" fill="none" stroke="#2FA866" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="384" y="58" width="5" height="10" rx="1" fill="#2E7BEA"/><rect x="394" y="54" width="5" height="14" rx="1" fill="#2E7BEA"/></g>' +
    '<g><rect x="372" y="90" width="48" height="44" rx="11" fill="#fff" opacity=".92"/><circle cx="396" cy="112" r="13" fill="#2FA866"/><path d="M392 105v14l11-7z" fill="#fff"/></g>' +
    '<g opacity=".9"><circle cx="40" cy="70" r="26" fill="#fff"/><text x="40" y="79" text-anchor="middle" font-size="26" font-weight="700" fill="#2FA866" font-family="Sarabun,sans-serif">฿</text></g>' +
    '</svg>';
}
function chartSVG() { return heroArt(); }
function introHTML() {
  return '<section class="intro"><div class="intro-in">' + IC.cap + '<p class="intro-kicker">ระบบสอบออนไลน์ · การเงินและการลงทุน</p><h1 class="intro-h">เรียนรู้ได้<em>ทุกที่ ทุกเวลา</em><br>พร้อมทดสอบความรู้แล้วหรือยัง</h1>' + heroArt() +
    '<div class="ringwrap"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="54"/><circle class="bar" id="ringBar" cx="60" cy="60" r="54" style="stroke-dashoffset:' + ringOff(S.introLeft) + '"/></svg><div class="ringnum" id="cnt" aria-live="polite">' + S.introLeft + '</div></div>' +
    '<p class="intro-sub">กำลังพาไปหน้าลงชื่อ…</p><button class="btn ghost" data-act="skipintro">ข้ามไปเลย</button></div>' + leafArt() + '</section>';
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
  return '<section class="hero hero-split"><div class="hero-txt"><p class="hero-kick">ขั้นตอนที่ 1 จาก 2</p><h1>กรอกข้อมูล<em>ผู้สอบ</em></h1><p class="hero-sub">ใช้ชื่อและเลขที่ที่ตรงกับรายชื่อในห้องเรียน ระบบจะใช้ข้อมูลนี้ส่งผลสอบให้ครู</p>' +
    '<div class="formcard"><label class="field"><span>ชื่อ-สกุล</span><input id="f-name" type="text" data-k="who-name" autocomplete="name" maxlength="60" value="' + esc(S.who.name) + '" placeholder="เช่น สมชาย ใจดี"></label>' +
    '<label class="field"><span>เลขที่</span><input id="f-no" type="text" inputmode="numeric" data-k="who-no" maxlength="3" value="' + esc(S.who.no) + '" placeholder="เช่น 12"></label>' +
    '<button id="nextBtn" class="btn accent block" data-act="tolist"' + (ok ? '' : ' disabled') + '>' + NI.play + 'ถัดไป: เลือกข้อสอบ</button></div></div>' + heroArt() + '</section>';
}
function loginHTML() {
  return '<section class="hero hero-split"><div class="hero-txt"><p class="hero-kick">สำหรับผู้สอน</p><h1>เข้าสู่<em>ระบบผู้สอน</em></h1><p class="hero-sub">กรอกรหัสผู้สอนที่ตั้งไว้ในระบบ เพื่อจัดการข้อสอบและดูผลสด</p>' +
    '<div class="formcard"><label class="field"><span>รหัสผู้สอน</span><input id="f-token" type="password" autocomplete="current-password" data-k="token" value=""></label>' +
    (S.loginErr ? '<div class="notice bad">' + esc(S.loginErr) + '</div>' : '') +
    '<button class="btn accent block" data-act="teachersubmit">' + NI.key + 'เข้าสู่ระบบ</button><button class="btn ghost block" data-act="cancellogin">กลับ</button></div></div>' + heroArt() + '</section>';
}

/* ---------- student: home ---------- */
function myAttempt(id) { return S.me[id] || null; }
function whoOk() { return S.who.name.trim().length > 0 && /^\d{1,3}$/.test(String(S.who.no).trim()); }
function statCard(icon, tone, num, label) {
  return '<div class="stat"><span class="stat-ic ' + tone + '">' + icon + '</span><div><b>' + num + '</b><span>' + label + '</span></div></div>';
}
function homeHTML() {
  var ex = examsSorted(), open = 0, done = 0, wait = 0;
  ex.forEach(function (e) { var a = myAttempt(e.id); if (e.open) open++; if (a && a.status === 'submitted') done++; else if (a) wait++; });
  return '<section class="hero"><div class="hero-txt"><p class="hero-kick">สวัสดี ' + esc(S.who.name) + ' · เลขที่ ' + esc(S.who.no) + '</p><h1>เรียนรู้ได้<em>ทุกที่ ทุกเวลา</em></h1><h2 class="hero-h2">พร้อมทดสอบความรู้กับข้อสอบออนไลน์ของเรา</h2><p class="hero-sub">เลือกข้อสอบด้านล่าง เข้าห้องรอ แล้วเริ่มทำพร้อมกันเมื่อครูกดเริ่มสอบ</p>' +
    '<div class="hero-btns"><button class="btn accent" data-act="tolistscroll">' + NI.play + 'เริ่มทำข้อสอบ</button><button class="btn ghost" data-act="editname">แก้ไขชื่อ</button></div></div>' + heroArt() + '</section>' +
    '<div class="stats">' + statCard(NI.play, 'g', open, 'ข้อสอบที่เปิดรับ') + statCard(NI.users, 'b', esc(S.who.no), 'เลขที่ของคุณ') + statCard(NI.trophy, 'o', done, 'ส่งแล้ว') + statCard(NI.star, 'p', wait, 'รอ / กำลังทำ') + '</div>' +
    '<div class="sechead"><h2>ข้อสอบที่เปิดรับสำหรับคุณ</h2><span class="hint" id="examCount"></span></div><div class="cgrid" id="examList">' + examListHTML() + '</div>';
}
var TONES = ['t1', 't2', 't3'];
function coverArt(i) {
  if (i % 3 === 0) return '<svg viewBox="0 0 300 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="#5AB8FF" stroke-width="1" opacity=".3"><path d="M0 40H300M0 80H300M0 120H300"/></g><polyline points="10,110 60,86 100,96 150,60 190,70 240,30 280,14" fill="none" stroke="#7CD3FF" stroke-width="3.5" stroke-linejoin="round"/><path d="M270 8l14 4-8 12z" fill="#7CD3FF"/>' +
    [0,1,2,3].map(function (k) { var x = 150 + k * 32, h = 30 + k * 16; return '<g>' + Array.apply(null, Array(Math.round(h / 8))).map(function (_, j) { return '<ellipse cx="' + x + '" cy="' + (128 - j * 8) + '" rx="14" ry="4.5" fill="' + (j % 2 ? '#E9C46A' : '#D4A23C') + '" stroke="#A97A1F" stroke-width=".8"/>'; }).join('') + '</g>'; }).join('') + '</svg>';
  if (i % 3 === 1) return '<svg viewBox="0 0 300 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect x="90" y="20" width="120" height="80" rx="8" fill="#1E3A5F"/><rect x="97" y="27" width="106" height="66" rx="4" fill="#0F2440"/><path d="M135 50l-12 10 12 10M165 50l12 10-12 10M155 46l-10 28" stroke="#7CC3FF" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M70 110l20-10h120l20 10z" fill="#CBD5E1"/><circle cx="250" cy="96" r="16" fill="#3B82F6" opacity=".8"/></svg>';
  return '<svg viewBox="0 0 300 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><ellipse cx="190" cy="126" rx="80" ry="16" fill="#6B4F2A"/><path d="M190 120V70" stroke="#3E8E41" stroke-width="5" stroke-linecap="round"/><path d="M190 86c-30-2-44-20-44-36 22 0 40 12 44 36zM190 76c4-26 22-40 46-40 0 18-16 38-46 40z" fill="#5CBF4A"/>' +
    [[60,40],[100,70],[60,100],[250,40]].map(function (c) { return '<path d="M' + c[0] + ' ' + (c[1] - 16) + 'l14 8v16l-14 8-14-8v-16z" fill="none" stroke="#C9F2D4" stroke-width="2" opacity=".85"/>'; }).join('') + '</svg>';
}
function examsSorted() {
  return Object.keys(S.exams).map(function (id) { return Object.assign({ id: id }, S.exams[id]); }).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
}
function examListHTML() {
  var out = [];
  examsSorted().forEach(function (e, i) {
    var a = myAttempt(e.id), active = a && a.status !== 'submitted';
    if (!e.open && !active && !(a && a.status === 'submitted')) return;
    var n = (e.questions || []).length, badge = 'เปิดรับ', st = '', btn = '';
    var ans = a ? Object.keys(a.answers || {}).length : 0, pct = n ? Math.round(ans / n * 100) : 0;
    if (a && a.status === 'submitted') { badge = 'ส่งแล้ว'; st = 'ส่งแล้ว ' + clock(a.submittedAt) + ' · ทำได้ครั้งเดียว'; btn = '<button class="btn ghost block" disabled>ส่งข้อสอบแล้ว</button>'; }
    else if (a && a.status === 'waiting') {
      badge = 'ห้องรอ';
      if (e.liveAt) { st = 'ครูเริ่มสอบแล้ว'; btn = '<button class="btn accent block" data-act="start" data-id="' + e.id + '" data-needid>' + NI.play + 'เข้าสอบ</button>'; }
      else { st = 'อยู่ในห้องรอ'; btn = '<button class="btn ghost block" data-act="lobby" data-id="' + e.id + '" data-needid>' + NI.play + 'กลับห้องรอ</button>'; }
    }
    else if (active) { badge = 'กำลังทำ'; st = 'กำลังทำค้างอยู่'; btn = '<button class="btn accent block" data-act="start" data-id="' + e.id + '" data-needid>' + NI.play + 'ทำต่อ</button>'; }
    else { st = e.proctor ? 'โหมดคุมสอบ: ระบบบันทึกเมื่อออกจากหน้าสอบ' : 'พร้อมให้เข้าห้องรอ'; btn = '<button class="btn accent block" data-act="join" data-id="' + e.id + '" data-needid>' + NI.play + 'เข้าห้องรอ</button>'; }
    out.push('<article class="ccard"><div class="ccover ' + TONES[i % 3] + '"><span class="cbadge">' + badge + '</span>' + coverArt(i) + '</div><div class="cbody"><h3>' + esc(e.title) + '</h3><div class="cmeta">' + NI.doc + '<span>' + n + ' ข้อ • ' + (e.minutes || 0) + ' นาที</span></div>' +
      '<div class="cprog"><div class="pbar"><i style="width:' + pct + '%"></i></div><span>' + pct + '%</span></div><p class="cstate">' + st + '</p>' + btn + '</div></article>');
  });
  if (!out.length) return '<div class="empty card">ยังไม่มีข้อสอบที่เปิดรับ เมื่อครูเปิดรับแล้ว รายการจะขึ้นที่นี่</div>';
  return out.join('');
}
/* ---------- student: waiting room ---------- */
function lobbyHTML() {
  var ex = S.exams[S.lobby];
  if (!ex) { S.lobby = null; return homeHTML(); }
  var n = (ex.questions || []).length;
  var info = '<div class="lobby-info"><span>' + NI.doc + n + ' ข้อ</span><span>' + IC.clock + (ex.minutes || 0) + ' นาที</span><span>' + NI.users + esc(S.who.name) + ' · เลขที่ ' + esc(S.who.no) + '</span></div>';
  if (ex.liveAt) {
    return '<section class="card lobby"><div class="lobby-dot go">' + NI.play + '</div><p class="hero-kick">เริ่มสอบแล้ว</p><h1>ครูเริ่มให้ทำข้อสอบได้แล้ว</h1><p class="muted">' + esc(ex.title) + '</p>' + info + '<p class="muted">' + (ex.proctor ? 'กดปุ่มแล้วระบบจะเข้าสู่โหมดเต็มจอ' : 'กดปุ่มด้านล่างเพื่อเริ่มทำข้อสอบ') + '</p><button class="btn accent block" data-act="start" data-id="' + esc(ex.id) + '">' + NI.play + 'เข้าสอบเลย</button></section>';
  }
  return '<section class="card lobby"><div class="lobby-dot"><i></i></div><p class="hero-kick">อยู่ในห้องรอ</p><h1>รอครูกดเริ่มสอบ</h1><p class="muted">' + esc(ex.title) + '</p>' + info + '<p class="muted">หน้านี้จะเปลี่ยนเป็นหน้าข้อสอบให้เองเมื่อครูเริ่มสอบ ไม่ต้องรีเฟรช</p><button class="btn ghost" data-act="leavelobby">ออกจากห้องรอ</button></section>';
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
/* ---------- exam page (light green layout) ---------- */
var IC = {
  cap: '<svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8 3 18l21 10 21-10z" fill="#16A05A"/><path d="M11 22v9c0 3 6 7 13 7s13-4 13-7v-9l-13 6z" fill="#0E7C45"/><path d="M42 19v11" stroke="#0E7C45" stroke-width="2.5" stroke-linecap="round"/><circle cx="38" cy="37" r="7" fill="#fff"/><path d="M36 33.5v7l6-3.5z" fill="#16A05A"/></svg>',
  list: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  flag: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  clock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  bars: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="13" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>',
  redo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>',
  left: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  right: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4.2"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>'
};
function flagsKey(R) { return 'omr.flags.' + R.examId + '.' + S.who.no; }
function ensureFlags(R) {
  if (R.flags) return R.flags;
  R.flags = {};
  if (!R.preview) { try { var o = JSON.parse(get(flagsKey(R)) || '{}'); if (o && typeof o === 'object') R.flags = o; } catch (e) {} }
  return R.flags;
}
function saveFlags(R) { if (!R.preview) put(flagsKey(R), JSON.stringify(R.flags || {})); }
function qState(R, q) { if (R.flags[q.id]) return 'flag'; if (R.att.answers[q.id] !== undefined) return 'ans'; return ''; }
function numGrid(list, R, cls) {
  return '<div class="' + cls + '">' + list.map(function (q, i) {
    var st = qState(R, q), cur = i === R.cur && !R.review;
    var lab = st === 'ans' ? 'ตอบแล้ว' : st === 'flag' ? 'ทบทวน' : 'ยังไม่ตอบ';
    return '<button class="xn' + (st ? ' ' + st : '') + (cur ? ' cur' : '') + '" data-act="goto" data-i="' + i + '" aria-label="ข้อ ' + (i + 1) + ' ' + lab + '"' + (cur ? ' aria-current="step"' : '') + '>' + (i + 1) + '</button>';
  }).join('') + '</div>';
}
function examHTML() {
  var R = S.run, att = R.att, ex = S.exams[R.examId];
  ensureFlags(R);
  var veil = '';
  if (R.needFs) veil = '<div class="veil"><div class="panel"><h2>กลับเข้าโหมดเต็มจอ</h2><p class="muted">ข้อสอบนี้ต้องทำในโหมดเต็มจอ แตะปุ่มด้านล่างเพื่อทำข้อสอบต่อ</p><button class="btn accent block" data-act="fsback">กลับเข้าโหมดเต็มจอ</button></div></div>';
  var whoTxt = R.preview ? 'ดูตัวอย่าง' : esc(S.who.name);
  var whoSub = R.preview ? 'ไม่มีการบันทึกผล' : 'เลขที่ ' + esc(S.who.no);
  var top = '<header class="xm-top"><div class="xm-top-in"><div class="xm-brand">' + IC.cap + '<span class="xm-sep" aria-hidden="true"></span><div class="xm-tt"><b>แบบทดสอบออนไลน์</b><span>' + esc(att.title) + '</span></div></div>' +
    '<div class="xm-who"><span class="xm-tchip">' + IC.clock + '<span data-tmr>--</span></span><span class="xm-avatar">' + IC.user + '</span><span class="xm-whot"><b>' + whoTxt + '</b><span>' + whoSub + '</span></span></div></div></header>';
  var notice = R.notice ? '<div class="xm-notice"><span>' + esc(R.notice) + '</span><button class="xm-btn ghost sm" data-act="dismiss">รับทราบ</button></div>' : '';
  var wrap = function (inner) { return veil + '<div class="xm">' + top + '<div class="xm-grid">' + inner + '</div></div>'; };
  if (!ex) return wrap('<main class="xm-main"><section class="xm-card"><h2 class="xm-qtext">ครูลบข้อสอบนี้แล้ว</h2><p class="xm-muted">คำตอบที่บันทึกไว้จะถูกส่งให้ครู</p><div style="margin-top:18px"><button class="xm-btn block" data-act="submit">ส่งเท่าที่ทำ</button></div></section></main>');
  var list = ordered(ex), total = list.length;
  if (!total) return wrap('<main class="xm-main"><section class="xm-card"><p class="xm-muted">ข้อสอบนี้ยังไม่มีคำถาม</p></section></main>');
  if (R.cur >= total) R.cur = total - 1;
  var answered = list.filter(function (q) { return att.answers[q.id] !== undefined; }).length;
  var flagged = list.filter(function (q) { return R.flags[q.id]; }).length;

  var left = '<aside class="xm-left"><div class="xm-card"><div class="xm-pill">' + IC.list + 'ข้อสอบทั้งหมด</div>' + numGrid(list, R, 'xm-nums c3') +
    '<ul class="xm-legend"><li><i class="ok"></i>ตอบแล้ว</li><li><i></i>ยังไม่ตอบ</li><li><i class="fl"></i>ทบทวน</li></ul></div></aside>';

  var center;
  if (R.review) {
    var un = total - answered;
    center = '<section class="xm-card"><div class="xm-qhead"><span class="xm-pill">' + IC.list + 'ตรวจทานก่อนส่ง</span></div>' +
      '<h2 class="xm-qtext">' + (un ? 'ยังไม่ได้ตอบ ' + un + ' ข้อ' : 'ตอบครบทุกข้อแล้ว') + '</h2><p class="xm-muted">' + (un || flagged ? 'แตะหมายเลขข้อเพื่อกลับไปแก้ไข' : 'ตรวจทานเรียบร้อยแล้ว กดส่งข้อสอบได้เลย') + (flagged ? ' · ทำเครื่องหมายทบทวนไว้ ' + flagged + ' ข้อ' : '') + '</p>' +
      numGrid(list, R, 'xm-nums c5 big') + '</section>' +
      '<div class="xm-card xm-navbar"><button class="xm-btn ghost" data-act="unreview">' + IC.left + 'กลับไปทำต่อ</button><button class="xm-btn" data-act="submit">ส่งข้อสอบ' + IC.right + '</button></div>';
  } else {
    var q = list[R.cur], chosen = att.answers[q.id], fl = !!R.flags[q.id];
    var idx = q.choices.map(function (_, i) { return i; }); if (ex.shuffle) idx = shuffle(idx, S.who.no + '|' + q.id);
    var opts = idx.map(function (orig, pos) {
      var on = chosen === orig;
      return '<label class="xm-opt' + (on ? ' on' : '') + '"><input type="radio" name="ch" value="' + orig + '" data-act="pick"' + (on ? ' checked' : '') + '><span class="xm-radio" aria-hidden="true"></span><span class="xm-let">' + (LET[pos] || pos + 1) + '.</span><span class="xm-otext">' + esc(q.choices[orig]) + '</span></label>';
    }).join('');
    var last = R.cur === total - 1;
    center = '<section class="xm-card xm-q' + (att.proctor ? ' noselect' : '') + '"><div class="xm-qhead"><span class="xm-pill">' + IC.list + 'ข้อที่ ' + (R.cur + 1) + ' จาก ' + total + '</span>' +
      '<button class="xm-flag' + (fl ? ' on' : '') + '" data-act="flag" aria-pressed="' + fl + '">' + IC.flag + (fl ? 'ทำเครื่องหมายทบทวนแล้ว' : 'ทำเครื่องหมายทบทวน') + '</button></div>' +
      '<h2 class="xm-qtext">' + esc(q.text) + '</h2>' + (q.pts && q.pts !== 1 ? '<p class="xm-muted" style="margin:-8px 0 14px">คะแนน ' + q.pts + '</p>' : '') +
      '<div class="xm-opts" role="radiogroup" aria-label="ตัวเลือก">' + opts + '</div></section>' +
      '<div class="xm-card xm-navbar"><button class="xm-btn ghost" data-act="prev"' + (R.cur === 0 ? ' disabled' : '') + '>' + IC.left + 'ข้อก่อนหน้า</button>' +
      (last ? '<button class="xm-btn" data-act="review">ตรวจทานและส่ง' + IC.right + '</button>' : '<button class="xm-btn" data-act="next">ข้อถัดไป' + IC.right + '</button>') + '</div>';
  }

  var quit = R.preview ? '<button class="xm-btn ghost sm block" data-act="exitpreview">ออกจากการดูตัวอย่าง</button>' : '';
  var right = '<aside class="xm-right"><div class="xm-card xm-time"><div class="xm-pill soft">' + IC.clock + 'เวลาที่เหลือ</div><div class="xm-clock" id="tmr" data-tmr>--</div><div class="xm-tbar"><i data-tbar></i></div>' +
    '<div class="xm-count"><span>จำนวนข้อที่ทำไปแล้ว</span><b>' + answered + ' / ' + total + '</b></div></div>' +
    '<div class="xm-card"><h3 class="xm-h3">' + IC.bars + 'สรุปคำตอบ</h3>' + numGrid(list, R, 'xm-nums c5') +
    '<button class="xm-btn ghost block" data-act="nextflag"' + (flagged ? '' : ' disabled') + '>' + IC.redo + 'ทบทวนข้อที่เลือก' + (flagged ? ' (' + flagged + ')' : '') + '</button>' +
    (R.review ? '' : '<button class="xm-btn block" data-act="review" style="margin-top:10px">ตรวจทานและส่งข้อสอบ</button>') +
    '<div class="xm-meta"><span id="sv"></span>' + (att.proctor && !R.preview ? '<span>ออกจากหน้าสอบ <b id="lvc">' + leaveCount(att) + '</b> ครั้ง</span>' : '') + '</div>' + quit + '</div></aside>';

  return wrap(left + '<main class="xm-main">' + notice + center + '</main>' + right);
}
function doneHTML() {
  var R = S.run, att = R.att, ex = S.exams[R.examId];
  var total = ex ? (ex.questions || []).length : Object.keys(att.answers).length;
  var n = ex ? (ex.questions || []).filter(function (q) { return att.answers[q.id] !== undefined; }).length : total;
  var timedOut = att.events && att.events.length && att.events[att.events.length - 1].t === 'timeout';
  var row = function (k, v) { return '<div class="xm-row"><span>' + k + '</span><b>' + v + '</b></div>'; };
  return '<div class="xm"><header class="xm-top"><div class="xm-top-in"><div class="xm-brand">' + IC.cap + '<span class="xm-sep" aria-hidden="true"></span><div class="xm-tt"><b>แบบทดสอบออนไลน์</b><span>' + esc(att.title) + '</span></div></div></div></header>' +
    '<div class="xm-done"><section class="xm-card"><div class="xm-check" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
    '<h1 class="xm-qtext" style="text-align:center;margin:14px 0 4px">ส่งข้อสอบเรียบร้อย</h1><p class="xm-muted" style="text-align:center;margin-bottom:18px">' + esc(att.title) + '</p>' +
    row('ชื่อ', esc(S.who.name)) + row('เลขที่', esc(S.who.no)) + row('ตอบแล้ว', n + ' / ' + total + ' ข้อ') + row('เวลาส่ง', clock(att.submittedAt) + (timedOut ? ' (หมดเวลา)' : '')) +
    (att.proctor ? row('ออกจากหน้าสอบ', leaveCount(att) + ' ครั้ง') : '') +
    '<p class="xm-muted" style="margin:16px 0">ผลคะแนนจะแจ้งโดยครูผู้สอน</p><div id="sv" class="xm-meta"></div><button class="xm-btn block" data-act="home">กลับหน้าหลัก</button></section></div></div>';
}
function afterExam() {
  updateTimer(); setSave(S.run.saveState || 'saved');
  if (!S.tm) S.tm = setInterval(tick, 1000);
}
/* นับถอยหลังแบบ ชม:นาที:วินาที */
function timerLabel(left) {
  if (left <= 0) return '00:00';
  var t = Math.ceil(left / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), r = t % 60;
  return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(r);
}
function updateTimer() {
  var R = S.run; if (!R) return;
  var left = R.att.endAt - Date.now(), label = timerLabel(left), low = left <= 60000;
  var span = Math.max(1, R.att.endAt - R.att.startedAt), pct = Math.max(0, Math.min(100, left / span * 100));
  var els = document.querySelectorAll('[data-tmr]');
  for (var i = 0; i < els.length; i++) {
    if (els[i].textContent !== label) els[i].textContent = label;
    if (els[i].classList.contains('low') !== low) els[i].classList.toggle('low', low);
  }
  var bars = document.querySelectorAll('[data-tbar]');
  for (var j = 0; j < bars.length; j++) { bars[j].style.width = pct.toFixed(2) + '%'; bars[j].classList.toggle('low', low); }
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
  if (typeof presenceTm !== 'undefined' && presenceTm) { clearTimeout(presenceTm); presenceTm = null; }
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
/* ออกจากหน้าสอบต้องหายไปนานเกินค่านี้ จึงจะนับเป็นออก (ตั้งเป็น 5 วินาที) */
var PRESENCE_MS = 5000;
var presenceTm = null;
function isGone() { return document.hidden || !document.hasFocus(); }
function confirmLeave(r) {
  presenceTm = null;
  var R = S.run;
  if (!R || R.att.status === 'submitted' || S.away || !isGone()) return;
  S.away = true; R.att.status = 'away';
  logEv('leave', { r: r, at: S.awaySince });
}
function checkPresence() {
  var R = S.run; if (!R || R.att.status === 'submitted') return;
  if (isGone()) {
    // เริ่มจับเวลา ยังไม่นับจนกว่าจะหายเกินค่าที่กำหนด
    if (!S.away && !presenceTm) {
      S.awaySince = Date.now();
      var r = document.hidden ? 'hidden' : 'blur';
      presenceTm = setTimeout(function () { confirmLeave(r); }, PRESENCE_MS);
    }
    return;
  }
  if (presenceTm) {
    // กลับมาก่อนครบเวลา: ไม่นับเป็นออก แต่บันทึกไว้ให้ครูดูย้อนหลังได้
    clearTimeout(presenceTm); presenceTm = null;
    logEv('quick', { at: S.awaySince, d: Date.now() - S.awaySince });
    return;
  }
  if (S.away) {
    S.away = false; var d = Date.now() - S.awaySince; R.att.status = 'doing';
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
  return '<div class="head"><div><p class="hero-kick">ผลสด</p><h1 style="margin-top:6px">ติดตามการทำ<em>ข้อสอบ</em></h1><p>อัปเดตเองอัตโนมัติ แตะชื่อเพื่อดูบันทึกเวลาของนักเรียนคนนั้น</p></div><button class="btn ghost sm" data-act="csv">ส่งออก CSV</button></div>' +
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
    case 'quick': return ['กลับเข้าหน้าสอบภายใน 5 วินาที (ไม่นับเป็นออก)', 0];
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


/* ---------- teacher: ตรวจงาน (รายชื่อ งาน ข้อสอบ ส่ง/ไม่ส่ง) ---------- */
var MARKS = { sent: ['ส่งแล้ว', '✓'], late: ['ส่งช้า', 'ช้า'], miss: ['ไม่ส่ง', '✗'] };
var MARK_NEXT = { '': 'sent', sent: 'late', late: 'miss', miss: '' };
async function loadBook() {
  try {
    var r = await api('teacher', { op: 'book', token: S.token });
    var sig = JSON.stringify([r.roster, r.tasks, r.marks]);
    S.book = { roster: r.roster || [], tasks: r.tasks || [], marks: r.marks || [] };
    S.bookErr = '';
    if (sig !== S.bookSig) { S.bookSig = sig; return true; }
    return false;
  } catch (e) {
    S.bookErr = e.code === 'unknown_op' ? 'ยังไม่ได้อัปเดต Edge Function ให้รองรับการตรวจงาน' : /relation|does not exist|schema cache/.test(e.message || '') ? 'ยังไม่ได้รันไฟล์ migrate-book.sql ใน Supabase' : '';
    return true;
  }
}
function bookRooms() {
  var set = {}; S.book.roster.forEach(function (r) { set[r.room] = 1; });
  return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'th', { numeric: true }); });
}
function bookStudents(room) {
  return S.book.roster.filter(function (r) { return r.room === room; }).sort(function (a, b) { return Number(a.no) - Number(b.no); });
}
function bookTasks(room) { return S.book.tasks.filter(function (t) { return t.room === room; }); }
function markOf(taskId, no) { for (var i = 0; i < S.book.marks.length; i++) { var m = S.book.marks[i]; if (m.task_id === taskId && String(m.no) === String(no)) return m.status; } return ''; }
function bookExKey(room) { return 'hs.bookEx.' + room; }
function bookExams(room) {
  var all = examsSorted().slice().reverse(), sel = null;
  try { sel = JSON.parse(get(bookExKey(room)) || 'null'); } catch (e) {}
  if (!Array.isArray(sel)) return all;
  return all.filter(function (e) { return sel.indexOf(e.id) >= 0; });
}
function normN(s) { return String(s || '').replace(/\s+/g, '').trim(); }
/* จับคู่ผลข้อสอบกับรายชื่อ: ครูจับคู่เอง > ชื่อตรงกัน > ชื่อต้นตรงกัน > เลขที่ตรงกัน */
var PREFIX_RE = /^(นางสาว|น\.ส\.|นส\.?|นาง|นาย|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|mr\.?|ms\.?|miss|mrs\.?)\s*/i;
function nameKey(s) { return String(s || '').trim().replace(PREFIX_RE, '').replace(/\s+/g, '').toLowerCase(); }
function firstKey(s) { return (String(s || '').trim().replace(PREFIX_RE, '').split(/\s+/)[0] || '').toLowerCase(); }
function attKey(a) { return a.examId + '|' + a.no + '|' + nameKey(a.name); }
function getLinks() { try { return JSON.parse(get('hs.bookLink') || '{}') || {}; } catch (e) { return {}; } }
function rankAtt(a) { return a.status === 'submitted' ? 3 : a.status === 'doing' || a.status === 'away' ? 2 : 1; }
function matchExam(ex, studs) {
  var atts = S.attempts.filter(function (x) { return x.examId === ex.id; });
  var links = getLinks(), map = {}, how = {}, used = [];
  var put2 = function (st, a, h) {
    var cur = map[st.no];
    if (cur && rankAtt(cur) >= rankAtt(a)) { used.push(a); return; }
    map[st.no] = a; how[st.no] = h; used.push(a);
  };
  var byNo = {}; studs.forEach(function (st) { byNo[String(Number(st.no))] = st; });
  // 1) ครูจับคู่เอง
  atts.forEach(function (a) { var n = links[attKey(a)]; if (n != null && byNo[String(n)]) put2(byNo[String(n)], a, 'link'); });
  var rest = function () { return atts.filter(function (a) { return used.indexOf(a) < 0; }); };
  // 2) ชื่อ-สกุลตรงกัน (ไม่สนคำนำหน้าและช่องว่าง)
  rest().forEach(function (a) { var k = nameKey(a.name); var hit = studs.filter(function (st) { return nameKey(st.name) === k; }); if (k && hit.length === 1) put2(hit[0], a, 'name'); });
  // 3) ชื่อต้นตรงกันคนเดียว
  rest().forEach(function (a) { var k = firstKey(a.name); var hit = studs.filter(function (st) { return k && firstKey(st.name) === k && !map[st.no]; }); if (hit.length === 1) put2(hit[0], a, 'first'); });
  // 4) เลขที่ตรงกัน (ช่องยังว่าง)
  rest().forEach(function (a) { var st = byNo[String(Number(a.no))]; if (st && !map[st.no]) put2(st, a, 'no'); });
  return { map: map, how: how, unmatched: rest() };
}
function examCellM(ex, st, M) {
  var a = M.map[st.no];
  if (!a) return { k: 'miss', t: 'ไม่ส่ง', x: 'ไม่ส่ง', sent: false };
  var h = M.how[st.no];
  var warn = h === 'no' && nameKey(a.name) !== nameKey(st.name) ? 'จับคู่จากเลขที่ · ชื่อในข้อสอบ: ' + a.name : h === 'first' ? 'จับคู่จากชื่อต้น · ในข้อสอบ: เลขที่ ' + a.no + ' ' + a.name : '';
  if (a.status === 'submitted') {
    var sc = scoreOf(a, ex, S.keys[ex.id]);
    var txt = sc ? sc.s + '/' + sc.max : 'ส่งแล้ว';
    return { k: 'sent', t: txt, x: txt, sent: true, warn: warn };
  }
  return { k: 'doing', t: a.status === 'waiting' ? 'ห้องรอ' : 'กำลังทำ', x: 'ยังไม่ส่ง', sent: false, warn: warn };
}
function examCell(ex, st) { return examCellM(ex, st, matchExam(ex, [st])); }
function unmatchedHTML(room, M) {
  var studs = bookStudents(room);
  var blocks = M.cols.filter(function (c) { return c.type === 'exam' && c.match.unmatched.length; }).map(function (c) {
    var rows = c.match.unmatched.sort(function (a, b) { return Number(a.no) - Number(b.no); }).map(function (a) {
      var opts = '<option value="">— เลือกนักเรียน —</option>' + studs.map(function (st) { var taken = c.match.map[st.no]; return '<option value="' + esc(st.no) + '">' + esc(st.no + '. ' + st.name) + (taken ? ' (มีผลแล้ว)' : '') + '</option>'; }).join('');
      return '<tr><td>' + esc(a.no) + '</td><td class="wide">' + esc(a.name) + '</td><td>' + (a.status === 'submitted' ? '<span class="state done">ส่งแล้ว</span>' : '<span class="state doing">ยังไม่ส่ง</span>') + '</td><td><select class="bk-link" data-key="' + esc(attKey(a)) + '" aria-label="จับคู่กับนักเรียน">' + opts + '</select></td></tr>';
    }).join('');
    return '<h3 class="bk-uh">' + esc(c.title) + ' <span class="muted small">(' + c.match.unmatched.length + ' รายการ)</span></h3><table class="tbl bk-un"><thead><tr><th>เลขที่ที่กรอก</th><th>ชื่อที่กรอกในข้อสอบ</th><th>สถานะ</th><th>เป็นของนักเรียนคนไหน</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }).join('');
  if (!blocks) return '';
  return '<section class="card bk-unbox"><h2>ผลสอบที่ยังจับคู่กับรายชื่อไม่ได้</h2><p class="muted small">นักเรียนกลุ่มนี้ทำข้อสอบแล้ว แต่เลขที่และชื่อที่กรอกไม่ตรงกับรายชื่อในห้องนี้ เลือกชื่อที่ถูกต้องเพื่อจับคู่ ระบบจะจำไว้ในเบราว์เซอร์นี้ (ถ้าเป็นนักเรียนห้องอื่น ปล่อยว่างไว้ได้)</p>' + blocks + '</section>';
}
function bookMatrix(room) {
  var studs = bookStudents(room), exs = bookExams(room), tks = bookTasks(room);
  var cols = exs.map(function (e) { return { type: 'exam', id: e.id, title: e.title, ex: e, match: matchExam(e, studs) }; }).concat(tks.map(function (t) { return { type: 'task', id: t.id, title: t.title, due: t.due, task: t }; }));
  var rows = studs.map(function (st) {
    var cells = cols.map(function (c) {
      if (c.type === 'exam') return examCellM(c.ex, st, c.match);
      var m = markOf(c.id, st.no);
      return { k: m || 'none', t: m ? MARKS[m][0] : '—', x: m ? MARKS[m][0] : '', sent: m === 'sent' || m === 'late', mark: m };
    });
    var sent = cells.filter(function (c) { return c.sent; }).length;
    return { st: st, cells: cells, sent: sent };
  });
  return { studs: studs, cols: cols, rows: rows };
}
function bookHTML() {
  var rooms = bookRooms();
  if (!S.bookRoom || rooms.indexOf(S.bookRoom) < 0) S.bookRoom = rooms[0] || '';
  var room = S.bookRoom;
  var head = '<div class="head"><div><p class="hero-kick">ตรวจงาน</p><h1 style="margin-top:6px">ตรวจการส่ง<em>งานของนักเรียน</em></h1><p>รวมผลข้อสอบในระบบกับงานที่ครูติ๊กเอง แล้วส่งออกเป็น Excel หรือ PDF</p></div>' +
    (room ? '<div class="bk-exp"><button class="btn accent sm" data-act="bkform">กรอกลงใบรายชื่อ (PDF)</button><button class="btn ghost sm" data-act="bkxlsx">ดาวน์โหลด Excel</button><button class="btn ghost sm" data-act="bkpdf">พิมพ์สรุป</button></div>' : '') + '</div>';
  var err = S.bookErr ? '<div class="notice bad" style="margin-bottom:14px">' + esc(S.bookErr) + '</div>' : '';
  var panel = bookPanelHTML(room);
  if (!rooms.length && !S.bookPanel) {
    return head + err + '<section class="card bk-empty">' + NI.users + '<h2>ยังไม่มีรายชื่อนักเรียน</h2><p class="muted">เริ่มจากสร้างห้องเรียนและวางรายชื่อจาก Excel หรือ Word ได้เลย</p><button class="btn accent" data-act="bkroster" data-v="new">' + NI.plus + 'เพิ่มรายชื่อห้องเรียน</button></section>';
  }
  var roomSel = rooms.length ? '<label class="field"><span>ห้องเรียน</span><select id="bk-room">' + rooms.map(function (r) { return '<option' + (r === room ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select></label>' : '';
  var tools = '<div class="toolbar">' + roomSel + '<div class="bk-tools"><button class="btn accent sm" data-act="bktask">' + NI.plus + 'เพิ่มงาน</button><button class="btn ghost sm" data-act="bkroster">แก้รายชื่อ</button><button class="btn ghost sm" data-act="bkroster" data-v="new">+ ห้องใหม่</button></div></div>';
  if (S.bookPanel) return head + err + (rooms.length ? tools : '') + panel;
  var all = examsSorted().slice().reverse(), selEx = bookExams(room).map(function (e) { return e.id; });
  var chips = all.length ? '<div class="bk-chips"><span class="muted small">ข้อสอบที่นับรวม:</span>' + all.map(function (e) { var on = selEx.indexOf(e.id) >= 0; return '<button class="chip' + (on ? ' on' : '') + '" data-act="bkex" data-id="' + e.id + '" aria-pressed="' + on + '">' + (on ? '✓ ' : '') + esc(e.title) + '</button>'; }).join('') + '</div>' : '';
  var M = bookMatrix(room);
  if (!M.cols.length) return head + err + tools + chips + '<section class="card bk-empty">' + NI.check + '<h2>ยังไม่มีงานหรือข้อสอบในตาราง</h2><p class="muted">กด “เพิ่มงาน” เพื่อสร้างงานที่ต้องติ๊กส่ง หรือเลือกข้อสอบด้านบน</p></section>';
  var th = '<th class="bk-no">เลขที่</th><th class="bk-name">ชื่อ-สกุล</th>' + M.cols.map(function (c) {
    var sub = c.type === 'exam' ? '<span class="bk-tag ex">ข้อสอบ</span>' : '<span class="bk-tag">' + (c.due ? 'ส่ง ' + esc(fmtDue(c.due)) : 'งาน') + '</span>';
    var act = c.type === 'task' ? '<span class="bk-colact"><button data-act="bkfill" data-id="' + c.id + '" data-v="sent" title="ติ๊กส่งแล้วให้ทุกคนที่ยังว่าง">✓ทั้งหมด</button><button data-act="bkfill" data-id="' + c.id + '" data-v="miss" title="ที่ยังว่างให้เป็นไม่ส่ง">ว่าง→✗</button><button data-act="bktask" data-id="' + c.id + '" title="แก้ไขงาน">แก้</button></span>' : '';
    return '<th class="bk-col"><div class="bk-ct">' + esc(c.title) + '</div>' + sub + act + '</th>';
  }).join('') + '<th class="bk-sum">ส่งแล้ว</th>';
  var body = M.rows.map(function (r) {
    return '<tr><td class="bk-no">' + esc(r.st.no) + '</td><td class="bk-name">' + esc(r.st.name) + '</td>' + r.cells.map(function (c, ci) {
      var col = M.cols[ci];
      if (col.type === 'exam') return '<td class="bk-c ' + c.k + '"' + (c.warn ? ' title="' + esc(c.warn) + '"' : '') + '><span class="bk-pill">' + esc(c.t) + (c.warn ? ' *' : '') + '</span></td>';
      return '<td class="bk-c ' + c.k + '"><button class="bk-pill" data-act="bkmark" data-id="' + col.id + '" data-v="' + esc(r.st.no) + '" aria-label="' + esc(r.st.name) + ' ' + esc(col.title) + ': ' + c.t + ' (แตะเพื่อเปลี่ยน)">' + (c.mark ? MARKS[c.mark][1] + ' ' : '') + c.t + '</button></td>';
    }).join('') + '<td class="bk-sum"><b>' + r.sent + '</b>/' + M.cols.length + '</td></tr>';
  }).join('');
  var foot = '<tr><td></td><td class="bk-name"><b>ส่งแล้ว (คน)</b></td>' + M.cols.map(function (c, ci) { var n = M.rows.filter(function (r) { return r.cells[ci].sent; }).length; return '<td class="bk-c"><b>' + n + '</b>/' + M.rows.length + '</td>'; }).join('') + '<td></td></tr>';
  var miss = M.rows.filter(function (r) { return r.sent < M.cols.length; }).length;
  var stats = '<div class="sumrow bk-stats"><div class="sum"><b>' + M.rows.length + '</b><span>นักเรียน</span></div><div class="sum"><b>' + M.cols.length + '</b><span>งาน + ข้อสอบ</span></div><div class="sum"><b>' + (M.rows.length - miss) + '</b><span>ส่งครบทุกงาน</span></div><div class="sum"><b style="color:var(--bad)">' + miss + '</b><span>ยังส่งไม่ครบ</span></div></div>';
  var legend = '<p class="hint bk-legend">แตะช่องงานเพื่อเปลี่ยนสถานะ: ว่าง → ✓ ส่งแล้ว → ส่งช้า → ✗ ไม่ส่ง → ว่าง · ช่องข้อสอบดึงจากระบบอัตโนมัติ · * จับคู่จากเลขที่หรือชื่อต้น ให้ตรวจซ้ำ (ชี้ที่ช่องเพื่อดูชื่อที่กรอก)</p>';
  var unm = unmatchedHTML(room, M), unN = M.cols.reduce(function (n, c) { return n + (c.match ? c.match.unmatched.length : 0); }, 0);
  if (unN) legend += '<div class="notice" style="margin-bottom:12px">มีผลสอบ ' + unN + ' รายการที่ยังหาเจ้าของในรายชื่อไม่เจอ ดูและจับคู่ได้ที่ด้านล่างตาราง</div>';
  return head + err + tools + chips + stats + legend + '<div class="tablewrap bk-scroll"><table class="tbl bk"><thead><tr>' + th + '</tr></thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>' + unm;
}
function fmtDue(d) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); if (!m) return d || ''; return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); }
function bookPanelHTML(room) {
  if (S.bookPanel === 'form') return formPanelHTML(room);
  if (S.bookPanel === 'roster' || S.bookPanel === 'rosterNew') {
    var isNew = S.bookPanel === 'rosterNew';
    var txt = isNew ? '' : bookStudents(room).map(function (s) { return s.no + '\t' + s.name; }).join('\n');
    var del = isNew ? '' : (S.confirmRoom ? '<button class="btn danger" data-act="bkroomdelyes">ยืนยันลบห้องนี้ทั้งหมด</button><button class="btn ghost" data-act="bkroomdelno">ยกเลิก</button>' : '<button class="btn danger" data-act="bkroomdel">ลบห้องนี้</button>');
    return '<section class="card stack"><h2>' + (isNew ? 'เพิ่มห้องเรียนใหม่' : 'แก้รายชื่อห้อง ' + esc(room)) + '</h2>' +
      '<label class="field"><span>ชื่อห้อง</span><input id="bk-roomname" type="text" maxlength="40" value="' + esc(isNew ? '' : room) + '" placeholder="เช่น ปวช.1/1"' + (isNew ? '' : ' readonly') + '></label>' +
      '<label class="field"><span>รายชื่อ (บรรทัดละ 1 คน: เลขที่ ตามด้วยชื่อ-สกุล)</span><textarea id="bk-list" data-k="bk-list" rows="12" placeholder="1&#9;นายสมชาย ใจดี&#10;2&#9;นางสาวสุดา ใจงาม&#10;…คัดลอกสองคอลัมน์จาก Excel หรือ Word มาวางได้เลย">' + esc(txt) + '</textarea></label>' +
      '<p class="hint" id="bk-count"></p>' + (S.bookErr ? '' : '') +
      '<div class="row"><button class="btn accent" data-act="bkrostersave"' + (S.bookBusy ? ' disabled' : '') + '>' + (S.bookBusy ? 'กำลังบันทึก…' : 'บันทึกรายชื่อ') + '</button><button class="btn ghost" data-act="bkclose">ยกเลิก</button>' + del + '</div></section>';
  }
  if (S.bookPanel && S.bookPanel.indexOf('task') === 0) {
    var tid = S.bookPanel.slice(5), t = null;
    S.book.tasks.forEach(function (x) { if (x.id === tid) t = x; });
    var delT = t ? (S.confirmTask === t.id ? '<button class="btn danger" data-act="bktaskdelyes" data-id="' + t.id + '">ยืนยันลบงาน</button><button class="btn ghost" data-act="bktaskdelno">ยกเลิก</button>' : '<button class="btn danger" data-act="bktaskdel" data-id="' + t.id + '">ลบงานนี้</button>') : '';
    return '<section class="card stack"><h2>' + (t ? 'แก้ไขงาน' : 'เพิ่มงานใหม่') + ' · ห้อง ' + esc(room) + '</h2>' +
      '<div class="row"><label class="field" style="flex:3 1 260px"><span>ชื่องาน</span><input id="bk-title" type="text" maxlength="120" value="' + esc(t ? t.title : '') + '" placeholder="เช่น ใบงานที่ 3.1 การวางแผนการออม"></label>' +
      '<label class="field" style="flex:1 1 160px"><span>กำหนดส่ง (ไม่บังคับ)</span><input id="bk-due" type="date" value="' + esc(t && t.due ? t.due : '') + '"></label></div>' +
      '<div class="row"><button class="btn accent" data-act="bktasksave" data-id="' + (t ? t.id : '') + '"' + (S.bookBusy ? ' disabled' : '') + '>' + (S.bookBusy ? 'กำลังบันทึก…' : 'บันทึกงาน') + '</button><button class="btn ghost" data-act="bkclose">ยกเลิก</button>' + delT + '</div></section>';
  }
  return '';
}

/* ---------- กรอกเครื่องหมายลงไฟล์ใบรายชื่อต้นฉบับ (ไม่แก้ส่วนอื่นของไฟล์) ---------- */
// ตำแหน่งตารางของแบบฟอร์มวิทยาลัย (หน่วย pt วัดจากขอบบนของหน้า A4)
var FORM = { x0: 275, colW: 15, cols: 20, top0: 139, rowH: 16, rows: 42, perPage: [41, 42], headLen: 36 };
// วาดหัวคอลัมน์ภาษาไทยบน canvas (ให้สระและวรรณยุกต์ซ้อนถูกต้อง) แล้วแปลงเป็นภาพ PNG
async function headPng(line1, line2) {
  try { if (document.fonts && document.fonts.load) await document.fonts.load('700 40px Sarabun'); } catch (e) {}
  var k = 10, W = FORM.headLen * k, Hh = (FORM.colW - 1.2) * k, cv = document.createElement('canvas');
  cv.width = Math.round(W); cv.height = Math.round(Hh);
  var g = cv.getContext('2d'); g.fillStyle = '#0D2673'; g.textAlign = 'center'; g.textBaseline = 'middle';
  var fit = function (t, max, size) { g.font = '700 ' + size + 'px Sarabun, "Noto Sans Thai", Tahoma, sans-serif'; while (size > 20 && g.measureText(t).width > max) { size -= 2; g.font = '700 ' + size + 'px Sarabun, "Noto Sans Thai", Tahoma, sans-serif'; } };
  var two = line1 && line2;
  if (line1) { fit(line1, W - 6, two ? 58 : 80); g.fillText(line1, W / 2, two ? Hh * 0.30 : Hh / 2); }
  if (line2) { fit(line2, W - 6, two ? 52 : 80); g.fillText(line2, W / 2, two ? Hh * 0.76 : Hh / 2); }
  var b64 = cv.toDataURL('image/png').split(',')[1];
  return b64ToBytes(b64);
}
var FORM_BYTES = null;
function formStoreKey() { return 'hs.formPdf'; }
function formSavedName() { return get('hs.formPdfName') || ''; }
function formMapKey(room) { return 'hs.formMap.' + room; }
function formOpts() { var o = {}; try { o = JSON.parse(get('hs.formOpt') || '{}') || {}; } catch (e) {} return { exam: o.exam || 'score', miss: o.miss || 'x' }; }
function formMap(room, cols) {
  var m = {}; try { m = JSON.parse(get(formMapKey(room)) || '{}') || {}; } catch (e) {}
  var used = {}; cols.forEach(function (c) { if (m[c.id] != null && m[c.id] !== '') used[m[c.id]] = 1; });
  var next = 1;
  cols.forEach(function (c) { if (m[c.id] === undefined) { while (used[next]) next++; if (next <= FORM.cols) { m[c.id] = next; used[next] = 1; } else m[c.id] = ''; } });
  return m;
}
function formMetaKey(room) { return 'hs.formMeta.' + room; }
function examFull(ex) { return (ex.questions || []).reduce(function (n, q) { return n + (Number(q.pts) || 1); }, 0); }
function autoLabel(title) { var m = /(บทที่|หน่วยที่|ใบงานที่|ใบงาน|ชิ้นงานที่|แบบฝึกหัดที่)\s*([\d.]+)/.exec(title || ''); return m ? m[1] + ' ' + m[2] : String(title || '').slice(0, 12); }
function formMeta(room, cols) {
  var m = {}; try { m = JSON.parse(get(formMetaKey(room)) || '{}') || {}; } catch (e) {}
  var out = {};
  cols.forEach(function (c) { var v = m[c.id] || {}; out[c.id] = { label: v.label != null ? v.label : autoLabel(c.title), full: v.full != null ? v.full : (c.type === 'exam' ? String(examFull(c.ex)) : '') }; });
  return out;
}
function formPanelHTML(room) {
  var M = bookMatrix(room), map = formMap(room, M.cols), o = formOpts(), fn = formSavedName() || (FORM_BYTES ? 'ไฟล์ที่เลือกไว้' : '');
  var colOpts = function (v) { var h = '<option value="">ไม่ใส่</option>'; for (var i = 1; i <= FORM.cols; i++) h += '<option value="' + i + '"' + (String(v) === String(i) ? ' selected' : '') + '>ช่องที่ ' + i + '</option>'; return h; };
  var meta = formMeta(room, M.cols), oh = get('hs.formHead') !== '0';
  var rows = M.cols.map(function (c) { var md = meta[c.id]; return '<div class="fm-row"><span class="fm-t"><span class="bk-tag' + (c.type === 'exam' ? ' ex' : '') + '">' + (c.type === 'exam' ? 'ข้อสอบ' : 'งาน') + '</span> ' + esc(c.title) + '</span><div class="fm-in"><label class="fm-mini"><span>หัวคอลัมน์</span><input type="text" class="fm-meta" data-id="' + esc(c.id) + '" data-f="label" maxlength="14" value="' + esc(md.label) + '"></label><label class="fm-mini fm-full"><span>คะแนนเต็ม</span><input type="text" inputmode="numeric" class="fm-meta" data-id="' + esc(c.id) + '" data-f="full" maxlength="4" value="' + esc(md.full) + '" placeholder="-"></label><select class="fm-col" data-id="' + esc(c.id) + '" aria-label="ช่องสำหรับ ' + esc(c.title) + '">' + colOpts(map[c.id]) + '</select></div></div>'; }).join('');
  return '<section class="card stack"><h2>กรอกลงใบรายชื่อของวิทยาลัย</h2><p class="muted">ระบบจะใส่เครื่องหมายลงในช่องตารางว่างของไฟล์ใบรายชื่อต้นฉบับเท่านั้น ส่วนอื่นของไฟล์ไม่ถูกแก้ไข ใช้ลำดับที่ในใบรายชื่อเป็นตัวจับคู่แถว</p>' +
    '<div class="fm-file"><label class="btn ghost sm" for="fm-pdf">เลือกไฟล์ใบรายชื่อ (PDF)</label><input id="fm-pdf" type="file" accept="application/pdf" hidden><span class="muted small">' + (fn ? 'ใช้ไฟล์: ' + esc(fn) : 'ยังไม่ได้เลือกไฟล์ (เลือกครั้งเดียว ระบบจำไว้ในเครื่องนี้)') + '</span></div>' +
    '<label class="check"><input type="checkbox" id="fm-head"' + (oh ? ' checked' : '') + '><span><b>เขียนหัวคอลัมน์</b><span class="hint">พิมพ์บทที่และคะแนนเต็มแนวตั้งในช่องหัวตารางของคอลัมน์ที่ใช้</span></span></label>' +
    '<div><h3 style="margin-bottom:8px">งานแต่ละรายการลงช่องไหน</h3><p class="hint" style="margin-bottom:8px">นับช่องตารางว่างจากซ้ายไปขวา ช่องที่ 1 คือช่องแรกถัดจากชื่อ-สกุล</p>' + (rows || '<p class="muted">ยังไม่มีงานหรือข้อสอบในตาราง</p>') + '</div>' +
    '<div class="row"><label class="field"><span>ช่องข้อสอบที่ส่งแล้ว ใส่</span><select id="fm-exam"><option value="score"' + (o.exam === 'score' ? ' selected' : '') + '>คะแนนที่ได้ (เช่น 15)</option><option value="check"' + (o.exam === 'check' ? ' selected' : '') + '>เครื่องหมาย ✓</option></select></label>' +
    '<label class="field"><span>คนที่ไม่ส่ง ใส่</span><select id="fm-miss"><option value="x"' + (o.miss === 'x' ? ' selected' : '') + '>เครื่องหมาย ✗</option><option value="blank"' + (o.miss === 'blank' ? ' selected' : '') + '>เว้นว่าง</option><option value="zero"' + (o.miss === 'zero' ? ' selected' : '') + '>เลข 0</option></select></label></div>' +
    '<p class="hint">งานที่ครูติ๊ก: ส่งแล้วและส่งช้าใส่ ✓ · ไม่ส่งใส่ตามที่เลือกด้านบน · ช่องที่ยังไม่ได้ติ๊กเว้นว่าง</p>' +
    '<div class="row"><button class="btn accent" data-act="fmmake"' + (S.bookBusy ? ' disabled' : '') + '>' + (S.bookBusy ? 'กำลังสร้างไฟล์…' : 'สร้างไฟล์ PDF') + '</button><button class="btn ghost" data-act="bkclose">ปิด</button></div></section>';
}
function b64ToBytes(b) { var s = atob(b), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function bytesToB64(u) { var s = '', ch = 0x8000; for (var i = 0; i < u.length; i += ch) s += String.fromCharCode.apply(null, u.subarray(i, i + ch)); return btoa(s); }
async function formPick(file) {
  if (!file) return;
  var buf = new Uint8Array(await file.arrayBuffer());
  FORM_BYTES = buf;
  try { localStorage.setItem(formStoreKey(), bytesToB64(buf)); put('hs.formPdfName', file.name); } catch (e) { put('hs.formPdfName', ''); toast('ไฟล์ใหญ่เกินกว่าจะจำไว้ จะใช้ได้จนกว่าจะปิดหน้านี้'); }
  render();
}
function formBytes() {
  if (FORM_BYTES) return FORM_BYTES;
  try { var b = localStorage.getItem(formStoreKey()); if (b) { FORM_BYTES = b64ToBytes(b); return FORM_BYTES; } } catch (e) {}
  return null;
}
function formCellPos(no, col) {
  var n = Number(no), page, row;
  if (n <= FORM.perPage[0]) { page = 0; row = n - 1; } else { page = 1; row = n - FORM.perPage[0] - 1; }
  if (row < 0 || row >= FORM.rows) return null;
  return { page: page, cx: FORM.x0 + (col - 0.5) * FORM.colW, cyTop: FORM.top0 + (row + 0.5) * FORM.rowH };
}
async function formMake() {
  var room = S.bookRoom, bytes = formBytes();
  if (!bytes) { toast('กรุณาเลือกไฟล์ใบรายชื่อ (PDF) ก่อน'); return; }
  var M = bookMatrix(room), map = formMap(room, M.cols), o = formOpts();
  S.bookBusy = true; render();
  try {
    if (!window.PDFLib) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js');
    var L = window.PDFLib, doc = await L.PDFDocument.load(bytes), pages = doc.getPages();
    var font = await doc.embedFont(L.StandardFonts.HelveticaBold), ink = L.rgb(0.05, 0.15, 0.45);
    var check = function (pg, cx, cy) { pg.drawLine({ start: { x: cx - 4, y: cy }, end: { x: cx - 1.2, y: cy - 3.4 }, thickness: 1.3, color: ink }); pg.drawLine({ start: { x: cx - 1.2, y: cy - 3.4 }, end: { x: cx + 4.4, y: cy + 4 }, thickness: 1.3, color: ink }); };
    var cross = function (pg, cx, cy) { var r = 3.3, red = L.rgb(0.72, 0.1, 0.1); pg.drawLine({ start: { x: cx - r, y: cy - r }, end: { x: cx + r, y: cy + r }, thickness: 1.2, color: red }); pg.drawLine({ start: { x: cx - r, y: cy + r }, end: { x: cx + r, y: cy - r }, thickness: 1.2, color: red }); };
    var text = function (pg, cx, cy, t) { var size = t.length > 2 ? 6.5 : 8.5, w = font.widthOfTextAtSize(t, size); pg.drawText(t, { x: cx - w / 2, y: cy - size * 0.36, size: size, font: font, color: ink }); };
    if (get('hs.formHead') !== '0') {
      var meta = formMeta(room, M.cols);
      for (var hi = 0; hi < M.cols.length; hi++) {
        var hc = M.cols[hi], hcol = Number(map[hc.id]); if (!hcol) continue;
        var md = meta[hc.id], l2 = md.full ? 'เต็ม ' + md.full : '';
        if (!md.label && !l2) continue;
        var png = await headPng(md.label, l2);
        var img = await doc.embedPng(png);
        pages.forEach(function (pg) {
          var H = pg.getHeight(), cellR = FORM.x0 + hcol * FORM.colW, yb = H - FORM.top0;
          pg.drawImage(img, { x: cellR - 0.6, y: yb + 1, width: FORM.headLen, height: FORM.colW - 1.2, rotate: L.degrees(90) });
        });
      }
    }
    var placed = 0, skipped = [];
    M.rows.forEach(function (r) {
      M.cols.forEach(function (c, ci) {
        var col = Number(map[c.id]); if (!col) return;
        var pos = formCellPos(r.st.no, col);
        if (!pos || !pages[pos.page]) { if (skipped.indexOf(r.st.no) < 0) skipped.push(r.st.no); return; }
        var pg = pages[pos.page], cy = pg.getHeight() - pos.cyTop, cell = r.cells[ci];
        if (c.type === 'exam') {
          if (cell.sent) { if (o.exam === 'score' && /^\d+(\.\d+)?\/\d+/.test(cell.t)) text(pg, pos.cx, cy, cell.t.split('/')[0]); else check(pg, pos.cx, cy); }
          else if (o.miss === 'x') cross(pg, pos.cx, cy); else if (o.miss === 'zero') text(pg, pos.cx, cy, '0');
        } else {
          if (cell.mark === 'sent' || cell.mark === 'late') check(pg, pos.cx, cy);
          else if (cell.mark === 'miss') { if (o.miss === 'x') cross(pg, pos.cx, cy); else if (o.miss === 'zero') text(pg, pos.cx, cy, '0'); }
          else return;
        }
        placed++;
      });
    });
    var out = await doc.save();
    var url = URL.createObjectURL(new Blob([out], { type: 'application/pdf' }));
    var a = document.createElement('a'); a.href = url; a.download = 'ใบรายชื่อ-' + room.replace(/[\\/:*?"<>|]/g, '-') + '.pdf'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    toast('สร้างไฟล์แล้ว ใส่เครื่องหมาย ' + placed + ' ช่อง' + (skipped.length ? ' (ไม่มีแถวในแบบฟอร์มสำหรับเลขที่ ' + skipped.join(', ') + ')' : ''));
  } catch (e) { toast('สร้างไฟล์ไม่สำเร็จ ตรวจว่าเป็นไฟล์ใบรายชื่อ PDF ที่ถูกต้อง'); }
  S.bookBusy = false; render();
}
function parseRoster(text) {
  var out = [], seen = {};
  String(text || '').split(/\r?\n/).forEach(function (line) {
    var parts = line.split(/\t|,|;|\s{2,}/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!parts.length) return;
    var no = null, name = [];
    if (parts.length === 1) { var m = /^(\d{1,3})[\s.)]+(.+)$/.exec(parts[0]); if (!m) return; no = m[1]; name = [m[2]]; }
    else parts.forEach(function (p) {
      if (no === null && /^\d{1,3}\.?$/.test(p)) { no = p.replace('.', ''); return; }
      if (/^[\d\-\s]+$/.test(p)) return;          // ข้ามรหัสนักเรียน
      name.push(p);
    });
    if (no === null && parts.length > 1) { var m2 = /^(\d{1,3})[\s.)]+(.+)$/.exec(parts[0]); if (m2) { no = m2[1]; name = [m2[2]].concat(parts.slice(1)); } }
    var nm = name.join(' ').replace(/\s+/g, ' ').trim();
    if (no === null || !nm || seen[no]) return;
    seen[no] = 1; out.push({ no: String(Number(no)), name: nm });
  });
  return out;
}
async function bookRosterSave() {
  var roomEl = document.getElementById('bk-roomname'), room = roomEl ? roomEl.value.replace(/\s+/g, ' ').trim() : '';
  var list = parseRoster((document.getElementById('bk-list') || {}).value);
  if (!room) { toast('กรุณาใส่ชื่อห้อง'); return; }
  if (!list.length) { toast('ไม่พบรายชื่อ ตรวจว่ามีเลขที่นำหน้าชื่อทุกบรรทัด'); return; }
  S.bookBusy = true; render();
  try { await api('teacher', { op: 'rosterSave', token: S.token, room: room, students: list }); S.bookRoom = room; S.bookPanel = null; toast('บันทึกรายชื่อ ' + list.length + ' คนแล้ว'); }
  catch (e) { toast('บันทึกไม่สำเร็จ: ' + msgOf(e.code)); }
  S.bookBusy = false; await loadBook(); render();
}
async function bookTaskSave(id) {
  var title = ((document.getElementById('bk-title') || {}).value || '').trim(), due = (document.getElementById('bk-due') || {}).value || '';
  if (!title) { toast('กรุณาใส่ชื่องาน'); return; }
  var old = null; S.book.tasks.forEach(function (x) { if (x.id === id) old = x; });
  S.bookBusy = true; render();
  try { await api('teacher', { op: 'taskSave', token: S.token, task: { id: id || nid('t'), room: S.bookRoom, title: title, due: due, sort: old ? old.sort : Date.now() } }); S.bookPanel = null; toast('บันทึกงานแล้ว'); }
  catch (e) { toast('บันทึกไม่สำเร็จ: ' + msgOf(e.code)); }
  S.bookBusy = false; await loadBook(); render();
}
function setLocalMark(taskId, no, status) {
  S.book.marks = S.book.marks.filter(function (m) { return !(m.task_id === taskId && String(m.no) === String(no)); });
  if (status) S.book.marks.push({ task_id: taskId, no: String(no), room: S.bookRoom, status: status });
}
async function bookMark(taskId, no) {
  var cur = markOf(taskId, no), nx = MARK_NEXT[cur];
  setLocalMark(taskId, no, nx);
  var y = window.scrollY, bs = document.querySelector('.bk-scroll'), bx = bs ? bs.scrollLeft : 0;
  render(); window.scrollTo(0, y); var bs2 = document.querySelector('.bk-scroll'); if (bs2) bs2.scrollLeft = bx;
  try { await api('teacher', { op: 'markSet', token: S.token, taskId: taskId, room: S.bookRoom, no: no, status: nx }); S.bookSig = ''; }
  catch (e) { setLocalMark(taskId, no, cur); render(); toast('บันทึกไม่สำเร็จ ลองอีกครั้ง'); }
}
async function bookFill(taskId, status) {
  var todo = bookStudents(S.bookRoom).filter(function (s) { return !markOf(taskId, s.no); });
  if (!todo.length) { toast('ทุกคนมีสถานะแล้ว'); return; }
  todo.forEach(function (s) { setLocalMark(taskId, s.no, status); }); render();
  var fail = 0;
  for (var i = 0; i < todo.length; i += 6) {
    await Promise.all(todo.slice(i, i + 6).map(function (s) { return api('teacher', { op: 'markSet', token: S.token, taskId: taskId, room: S.bookRoom, no: s.no, status: status }).catch(function () { fail++; }); }));
  }
  await loadBook(); render();
  toast(fail ? 'บันทึกไม่สำเร็จ ' + fail + ' คน ลองอีกครั้ง' : 'บันทึก ' + todo.length + ' คนแล้ว');
}
function bookToggleExam(id) {
  var room = S.bookRoom, cur = bookExams(room).map(function (e) { return e.id; });
  var i = cur.indexOf(id); if (i >= 0) cur.splice(i, 1); else cur.push(id);
  put(bookExKey(room), JSON.stringify(cur)); render();
}
function bookTable(room) {
  var M = bookMatrix(room);
  var header = ['เลขที่', 'ชื่อ-สกุล'].concat(M.cols.map(function (c) { return (c.type === 'exam' ? '[ข้อสอบ] ' : '') + c.title + (c.due ? ' (ส่ง ' + fmtDue(c.due) + ')' : ''); })).concat(['ส่งแล้ว', 'ยังไม่ส่ง']);
  var rows = M.rows.map(function (r) { return [Number(r.st.no), r.st.name].concat(r.cells.map(function (c) { return c.x === '' ? '-' : c.x; })).concat([r.sent, M.cols.length - r.sent]); });
  var foot = ['', 'ส่งแล้ว (คน)'].concat(M.cols.map(function (c, ci) { return M.rows.filter(function (r) { return r.cells[ci].sent; }).length + '/' + M.rows.length; })).concat(['', '']);
  return { M: M, header: header, rows: rows, foot: foot };
}
function loadScript(src) {
  return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function bookExcel() {
  var room = S.bookRoom, T = bookTable(room), today = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  var fname = 'สรุปการส่งงาน-' + room.replace(/[\\/:*?"<>|]/g, '-');
  var aoa = [['สรุปการส่งงาน ห้อง ' + room], ['ข้อมูล ณ วันที่ ' + today], [], T.header].concat(T.rows).concat([T.foot]);
  try {
    if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = T.header.map(function (h, i) { return { wch: i === 0 ? 7 : i === 1 ? 28 : Math.min(30, Math.max(10, String(h).length + 2)) }; });
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(1, T.header.length - 1) } }];
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'สรุปการส่งงาน');
    XLSX.writeFile(wb, fname + '.xlsx');
    toast('ดาวน์โหลดไฟล์ Excel แล้ว');
  } catch (e) {
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var csv = aoa.map(function (r) { return r.map(q).join(','); }).join('\r\n');
    var url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a'); a.href = url; a.download = fname + '.csv'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    toast('ดาวน์โหลดเป็นไฟล์ CSV (เปิดด้วย Excel ได้)');
  }
}
function bookPdf() {
  var room = S.bookRoom, T = bookTable(room), M = T.M, today = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  var miss = M.rows.filter(function (r) { return r.sent < M.cols.length; });
  var cls = function (c) { return c.k === 'sent' ? 'ok' : c.k === 'late' ? 'late' : c.k === 'miss' ? 'no' : ''; };
  var html = '<div class="pr-head"><div><h1>สรุปการส่งงาน ห้อง ' + esc(room) + '</h1><p>ข้อมูล ณ วันที่ ' + today + ' · นักเรียน ' + M.rows.length + ' คน · งานและข้อสอบ ' + M.cols.length + ' รายการ</p></div><div class="pr-box"><b>' + (M.rows.length - miss.length) + '</b> คนส่งครบ<br><b>' + miss.length + '</b> คนยังไม่ครบ</div></div>' +
    '<table class="pr"><thead><tr>' + T.header.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    M.rows.map(function (r) { return '<tr><td>' + esc(r.st.no) + '</td><td class="nm">' + esc(r.st.name) + '</td>' + r.cells.map(function (c) { return '<td class="' + cls(c) + '">' + esc(c.t) + '</td>'; }).join('') + '<td><b>' + r.sent + '</b></td><td' + (M.cols.length - r.sent ? ' class="no"' : '') + '>' + (M.cols.length - r.sent) + '</td></tr>'; }).join('') +
    '</tbody><tfoot><tr>' + T.foot.map(function (f) { return '<td>' + esc(f) + '</td>'; }).join('') + '</tr></tfoot></table>' +
    (miss.length ? '<h2>รายชื่อนักเรียนที่ยังส่งไม่ครบ</h2><ol class="pr-miss">' + miss.map(function (r) { var left = M.cols.filter(function (c, ci) { return !r.cells[ci].sent; }).map(function (c) { return c.title; }); return '<li><b>เลขที่ ' + esc(r.st.no) + ' ' + esc(r.st.name) + '</b> — ' + esc(left.join(', ')) + '</li>'; }).join('') + '</ol>' : '<h2>นักเรียนส่งงานครบทุกคน</h2>') +
    '<p class="pr-sign">ลงชื่อ ........................................ ครูผู้สอน</p>';
  var box = document.getElementById('printArea');
  if (!box) { box = document.createElement('div'); box.id = 'printArea'; document.body.appendChild(box); }
  box.innerHTML = html;
  document.body.classList.add('printing');
  var done = function () { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(function () { window.print(); }, 50);
}

/* ---------- teacher: exams list + editor ---------- */
function examsHTML() {
  var ex = examsSorted(), openN = 0, doing = 0, done = 0;
  ex.forEach(function (e) { if (e.open) openN++; });
  S.attempts.forEach(function (a) { if (a.status === 'submitted') done++; else if (a.status === 'doing' || a.status === 'away') doing++; });
  var list = ex.map(function (e, i) {
    var n = (e.questions || []).length;
    var mine = S.attempts.filter(function (a) { return a.examId === e.id; });
    var sub = mine.filter(function (a) { return a.status === 'submitted'; }).length;
    var pct = mine.length ? Math.round(sub / mine.length * 100) : 0;
    var badge = e.liveAt ? 'กำลังสอบ' : e.open ? 'เปิดรับ' : 'ปิดรับ';
    var del = S.confirmDel === e.id ? '<button class="btn danger sm" data-act="delyes" data-id="' + e.id + '">ยืนยันลบ</button><button class="btn ghost sm" data-act="delno">ยกเลิก</button>' : '<button class="btn ghost sm" data-act="del" data-id="' + e.id + '">ลบ</button>';
    return '<article class="ccard"><div class="ccover ' + TONES[i % 3] + '"><span class="cbadge' + (e.open ? '' : ' off') + '">' + badge + '</span>' + coverArt(i) + '</div><div class="cbody"><h3>' + esc(e.title) + '</h3>' +
      '<div class="cmeta">' + NI.doc + '<span>' + n + ' ข้อ • ' + (e.minutes || 0) + ' นาที' + (e.proctor ? ' • คุมสอบ' : '') + (e.shuffle ? ' • สลับข้อ' : '') + '</span></div>' +
      '<div class="cprog"><div class="pbar"><i style="width:' + pct + '%"></i></div><span>' + pct + '%</span></div><p class="cstate">ส่งแล้ว ' + sub + ' จาก ' + mine.length + ' คน</p>' +
      '<button class="btn ' + (e.liveAt ? 'ghost' : 'accent') + ' block" data-act="golive" data-id="' + e.id + '" data-v="' + (e.liveAt ? '0' : '1') + '">' + NI.play + (e.liveAt ? 'จบการสอบพร้อมกัน' : 'เริ่มสอบพร้อมกัน') + '</button>' +
      '<div class="cacts"><button class="btn ghost sm" data-act="toggleopen" data-id="' + e.id + '">' + (e.open ? 'ปิดรับ' : 'เปิดรับ') + '</button><button class="btn ghost sm" data-act="edit" data-id="' + e.id + '">แก้ไข</button><button class="btn ghost sm" data-act="preview" data-id="' + e.id + '">ดูตัวอย่าง</button><button class="btn ghost sm" data-act="track" data-id="' + e.id + '">ผลสด</button>' + del + '</div></div></article>';
  }).join('');
  // แผงด้านขวา: ข้อสอบที่กำลังสอบ และวงกลมความคืบหน้า
  var live = ex.filter(function (e) { return e.liveAt; });
  var focus = live[0] || ex[0];
  var fm = focus ? S.attempts.filter(function (a) { return a.examId === focus.id; }) : [];
  var fs = fm.filter(function (a) { return a.status === 'submitted'; }).length, fp = fm.length ? Math.round(fs / fm.length * 100) : 0;
  var C = 2 * Math.PI * 46;
  var sched = live.length ? live.map(function (e) { var d = new Date(e.liveAt); return '<div class="sched"><div class="sched-d"><span>เริ่ม</span><b>' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</b><span>น.</span></div><div class="sched-t"><b>' + esc(e.title) + '</b><span>' + (e.minutes || 0) + ' นาที · หมดเวลา ' + clock(e.liveAt + (e.minutes || 0) * 60000).slice(0, 5) + ' น.</span><button class="btn accent sm" data-act="track" data-id="' + e.id + '">ดูผลสด' + NI.arrow + '</button></div></div>'; }).join('')
    : '<p class="muted small">ยังไม่มีข้อสอบที่กำลังสอบ กด “เริ่มสอบพร้อมกัน” ที่การ์ดข้อสอบเพื่อเริ่ม</p>';
  var side = '<aside class="rcol"><section class="card"><div class="card-h"><h3>' + NI.cal + 'การสอบที่กำลังดำเนินอยู่</h3></div>' + sched + '</section>' +
    '<section class="card donutcard"><div class="card-h"><h3>' + NI.chart + 'ความคืบหน้าการส่ง</h3></div><div class="donutrow"><div class="donut"><svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="46" fill="none" stroke="#DDEFE4" stroke-width="12"/><circle cx="55" cy="55" r="46" fill="none" stroke="#16A05A" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - fp / 100)).toFixed(1) + '" transform="rotate(-90 55 55)"/></svg><b>' + fp + '%</b></div>' +
    '<div><span class="muted small">' + (focus ? esc(focus.title) : 'ยังไม่มีข้อสอบ') + '</span><p><b>ส่งแล้ว ' + fs + ' จาก ' + fm.length + ' คน</b></p>' + (focus ? '<button class="btn ghost sm" data-act="track" data-id="' + focus.id + '">ดูรายละเอียด</button>' : '') + '</div></div></section></aside>';
  return '<section class="hero"><div class="hero-txt"><p class="hero-kick">แผงควบคุมผู้สอน</p><h1>จัดการข้อสอบได้<em>ทุกที่ ทุกเวลา</em></h1><h2 class="hero-h2">สร้าง แก้ไข และติดตามผลสอบแบบเรียลไทม์</h2><p class="hero-sub">แก้ไขได้ตลอด นักเรียนที่เปิดหน้าอยู่จะเห็นการเปลี่ยนแปลงภายในไม่กี่วินาที</p>' +
    '<div class="hero-btns"><button class="btn accent" data-act="newexam">' + NI.plus + 'สร้างข้อสอบ</button><button class="btn ghost" data-act="area" data-v="live">' + NI.chart + 'ดูผลสด</button></div></div>' + heroArt() + '</section>' +
    '<div class="stats">' + statCard(NI.play, 'g', ex.length, 'ข้อสอบทั้งหมด') + statCard(NI.users, 'b', openN, 'เปิดรับอยู่') + statCard(NI.trophy, 'o', doing, 'กำลังสอบตอนนี้') + statCard(NI.star, 'p', done, 'ส่งแล้วทั้งหมด') + '</div>' +
    '<div class="twocol"><div><div class="sechead"><h2>ข้อสอบของคุณ</h2><button class="linkarrow" data-act="newexam">สร้างใหม่' + NI.arrow + '</button></div>' +
    (list ? '<div class="cgrid">' + list + '</div>' : '<div class="empty card">ยังไม่มีข้อสอบ กด “สร้างข้อสอบ” เพื่อเริ่มต้น</div>') + '</div>' + side + '</div>';
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
    case 'area': if (S.editing) return; if (S.run && S.run.att.status === 'submitted') endRun(); S.area = b.getAttribute('data-v'); S.detail = null; render(); if (S.area === 'book') loadBook().then(function () { render(); }); break;
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
    case 'tolistscroll': var el = document.getElementById('examList'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
    case 'home': endRun(); if (S.area === 'login') S.area = 'student'; render(); loadStatus().then(function (c) { if (c) refreshView(); }); break;
    case 'goto': R.cur = +b.getAttribute('data-i'); R.review = false; render(); window.scrollTo(0, 0); break;
    case 'prev': if (R.cur > 0) { R.cur--; render(); window.scrollTo(0, 0); } break;
    case 'next': R.cur++; render(); window.scrollTo(0, 0); break;
    case 'review': R.review = true; render(); window.scrollTo(0, 0); break;
    case 'unreview': R.review = false; render(); break;
    case 'flag':
      var fx = S.exams[R.examId], fq = fx && ordered(fx)[R.cur];
      if (fq) { ensureFlags(R); if (R.flags[fq.id]) delete R.flags[fq.id]; else R.flags[fq.id] = true; saveFlags(R); render(); }
      break;
    case 'nextflag':
      var nx = S.exams[R.examId]; if (!nx) break;
      ensureFlags(R);
      var nl = ordered(nx), from = R.review ? -1 : R.cur;
      for (var k = 1; k <= nl.length; k++) { var ii = (from + k + nl.length) % nl.length; if (R.flags[nl[ii].id]) { R.cur = ii; R.review = false; render(); window.scrollTo(0, 0); break; } }
      break;
    case 'submit': submitExam('manual'); break;
    case 'dismiss': R.notice = null; render(); break;
    case 'fsback': reqFs().then(function (ok) { if (!S.run) return; S.run.needFs = false; S.run.fs = ok; render(); }); break;
    case 'detail': S.detail = b.getAttribute('data-uid'); S.confirmReset = null; renderLiveParts(); var dv = document.getElementById('liveDetail'); if (dv && dv.scrollIntoView) dv.scrollIntoView({ block: 'start', behavior: 'smooth' }); break;
    case 'closedetail': S.detail = null; S.confirmReset = null; renderLiveParts(); break;
    case 'reset': S.confirmReset = b.getAttribute('data-uid'); renderLiveParts(); break;
    case 'resetno': S.confirmReset = null; renderLiveParts(); break;
    case 'resetyes': resetAttempt(b.getAttribute('data-uid')); break;
    case 'csv': exportCsv(); break;
    case 'bkroster': S.bookPanel = b.getAttribute('data-v') === 'new' ? 'rosterNew' : 'roster'; S.confirmRoom = false; render(); window.scrollTo(0, 0); break;
    case 'bktask': S.bookPanel = 'task:' + (id || ''); S.confirmTask = null; render(); window.scrollTo(0, 0); break;
    case 'bkclose': S.bookPanel = null; render(); break;
    case 'bkrostersave': bookRosterSave(); break;
    case 'bktasksave': bookTaskSave(id); break;
    case 'bkmark': bookMark(id, b.getAttribute('data-v')); break;
    case 'bkfill': bookFill(id, b.getAttribute('data-v')); break;
    case 'bkex': bookToggleExam(id); break;
    case 'bkxlsx': bookExcel(); break;
    case 'bkpdf': bookPdf(); break;
    case 'bkform': S.bookPanel = 'form'; render(); window.scrollTo(0, 0); break;
    case 'fmmake': formMake(); break;
    case 'bkroomdel': S.confirmRoom = true; render(); break;
    case 'bkroomdelno': S.confirmRoom = false; render(); break;
    case 'bkroomdelyes':
      api('teacher', { op: 'roomDelete', token: S.token, room: S.bookRoom }).then(function () { S.bookPanel = null; S.bookRoom = ''; toast('ลบห้องแล้ว'); return loadBook(); }, function () { toast('ลบไม่สำเร็จ'); }).then(function () { render(); });
      break;
    case 'bktaskdel': S.confirmTask = id; render(); break;
    case 'bktaskdelno': S.confirmTask = null; render(); break;
    case 'bktaskdelyes':
      api('teacher', { op: 'taskDelete', token: S.token, taskId: id }).then(function () { S.bookPanel = null; toast('ลบงานแล้ว'); return loadBook(); }, function () { toast('ลบไม่สำเร็จ'); }).then(function () { render(); });
      break;

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
    var y = window.scrollY; render(); window.scrollTo(0, y);
    setSave('saving'); queueFlush(1200);
  }
  if (t.classList && t.classList.contains('bk-link')) { var L = getLinks(), key = t.getAttribute('data-key'); if (t.value) L[key] = t.value; else delete L[key]; put('hs.bookLink', JSON.stringify(L)); var yy = window.scrollY; render(); window.scrollTo(0, yy); toast(t.value ? 'จับคู่แล้ว' : 'ยกเลิกการจับคู่แล้ว'); }
  if (t.id === 'fm-pdf') formPick(t.files && t.files[0]);
  if (t.classList && t.classList.contains('fm-col')) { var fmR = S.bookRoom, fm = {}; try { fm = JSON.parse(get(formMapKey(fmR)) || '{}') || {}; } catch (e2) {} var dup = t.value; if (dup) Object.keys(fm).forEach(function (k) { if (String(fm[k]) === dup && k !== t.getAttribute('data-id')) fm[k] = ''; }); var cur = formMap(fmR, bookMatrix(fmR).cols); Object.keys(cur).forEach(function (k) { if (fm[k] === undefined) fm[k] = cur[k]; }); fm[t.getAttribute('data-id')] = t.value; put(formMapKey(fmR), JSON.stringify(fm)); render(); }
  if (t.id === 'fm-head') put('hs.formHead', t.checked ? '1' : '0');
  if (t.classList && t.classList.contains('fm-meta')) { var mr = S.bookRoom, mm = {}; try { mm = JSON.parse(get(formMetaKey(mr)) || '{}') || {}; } catch (e3) {} var mid = t.getAttribute('data-id'); mm[mid] = mm[mid] || {}; mm[mid][t.getAttribute('data-f')] = t.value.trim(); put(formMetaKey(mr), JSON.stringify(mm)); }
  if (t.id === 'fm-exam' || t.id === 'fm-miss') { var fo = formOpts(); fo[t.id === 'fm-exam' ? 'exam' : 'miss'] = t.value; put('hs.formOpt', JSON.stringify(fo)); }
  if (t.id === 'bk-room') { S.bookRoom = t.value; render(); }
  if (t.id === 'sel-exam') { S.examSel = t.value; S.detail = null; renderLiveParts(); }
  if (t.getAttribute('data-k') === 'ans') { var D = S.editing; if (D && t.checked) D.questions[+t.getAttribute('data-qi')].ans = +t.getAttribute('data-ci'); }
});
app.addEventListener('input', function (e) {
  var t = e.target, k = t.getAttribute && t.getAttribute('data-k'); if (!k) return;
  if (k === 'who-name' || k === 'who-no') {
    if (k === 'who-name') S.who.name = t.value; else S.who.no = t.value;
    put('omr.who', JSON.stringify(S.who)); updateIdGate(); return;
  }
  if (t.id === 'bk-list') { var c = document.getElementById('bk-count'); if (c) c.textContent = 'อ่านได้ ' + parseRoster(t.value).length + ' คน'; return; }
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
