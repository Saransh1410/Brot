

const S = {
  habits: [], tasks: [], analytics: null,
  sessions: { sessions: [], totalMinutes: 0, totalSessions: 0 },
  hFilter: 'all', tFilter: 'all', emoji: '⚡',
  clockHr: 12, clockMin: 0, clockAmpm: 'AM', clockMode: 'hour', clockOpen: false,
  chatOpen: false
};

// ── Notification System ───────────────────────────────────────────────────
// Asks for permission once, then reminds every 2 hours if habits/tasks pending

function requestNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendNotif(title, body, icon) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '⚡', badge: '⚡' });
  } catch(e) {}
}

function checkAndNotify() {
  if (!Auth.isLoggedIn()) return;

  const pendingHabits = S.habits.filter(h => !h.doneToday);
  const pendingTasks  = S.tasks.filter(t => !t.done && t.dueDate === new Date().toISOString().split('T')[0]);
  const hour = new Date().getHours();

  // only notify between 8am and 10pm
  if (hour < 8 || hour >= 22) return;

  if (pendingHabits.length > 0 && pendingTasks.length > 0) {
    sendNotif(
      '⚡ Brot Reminder',
      `You still have ${pendingHabits.length} habit(s) and ${pendingTasks.length} task(s) left today. Keep going!`
    );
  } else if (pendingHabits.length > 0) {
    sendNotif(
      '🔁 Habit Reminder',
      `${pendingHabits.length} habit(s) not done yet: ${pendingHabits.slice(0,2).map(h=>h.name).join(', ')}${pendingHabits.length > 2 ? '...' : ''}`
    );
  } else if (pendingTasks.length > 0) {
    sendNotif(
      '✅ Task Reminder',
      `${pendingTasks.length} task(s) due today still pending. Don't let them slip!`
    );
  }
}

function startNotifScheduler() {
  requestNotifPermission();
  // Check every 2 hours (7200000 ms)
  setInterval(checkAndNotify, 2 * 60 * 60 * 1000);
  // Also check once after 30 seconds to catch first session
  setTimeout(checkAndNotify, 30 * 1000);
}

async function boot() {
  if (!Auth.isLoggedIn()) return showAuth();
  try { await AuthAPI.me(); showApp(); await loadAll(); }
  catch { Auth.clear(); showAuth(); }
}

function showAuth() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  // show guide bot on login screen
  document.getElementById('chatFab').style.display = 'flex';
  startNotifScheduler();
  document.getElementById('chatFab').title = 'AI Mentor';
  document.getElementById('chatFabIcon').textContent = '🤖';
  document.getElementById('chatMsgs').innerHTML = '';
  document.getElementById('chatSuggs').innerHTML = '';
  document.getElementById('chatFab').title = 'Need help?';
  document.getElementById('chatFabIcon').textContent = '❓';
  showLoginGuide();
}

function showApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('chatFab').style.display = 'flex';
  
  document.getElementById('chatFab').title = 'AI Mentor';
  document.getElementById('chatFabIcon').textContent = '🤖';
  document.getElementById('chatMsgs').innerHTML = '';
  document.getElementById('chatSuggs').innerHTML = '';
  const u = Auth.getUser();
  if (u) {
    document.getElementById('sAvatar').textContent = u.name[0].toUpperCase();
    document.getElementById('sName').textContent = u.name;
    const days = u.daysSinceJoined || 1;
    document.getElementById('sMeta').textContent = `${u.streak || 0}🔥 of ${days} day${days !== 1 ? 's' : ''}`;
  }
  setHeader();
}

async function loadAll() {
  try {
    const [h, t, a, ss] = await Promise.all([HabitsAPI.getAll(), TasksAPI.getAll(), AnalyticsAPI.get(), SessionsAPI.getAll()]);
    S.habits = h.habits; S.tasks = t.tasks; S.analytics = a; S.sessions = ss;
    renderAll();
    setTimeout(() => sendWelcome(), 600);
  } catch (e) { toast(e.message, 'err'); }
}

function renderAll() { renderDash(); renderHabits(); renderTasks(); renderAnalytics(); renderFStats(); updateBadges(); }

function switchTab(t) {
  document.getElementById('loginForm').style.display = t === 'login' ? 'block' : 'none';
  document.getElementById('regForm').style.display = t === 'register' ? 'block' : 'none';
  document.getElementById('tabLogin').classList.toggle('active', t === 'login');
  document.getElementById('tabReg').classList.toggle('active', t === 'register');
  document.getElementById('authErr').style.display = 'none';
}

async function doLogin() {
  const btn = document.getElementById('loginBtn');
  const e = document.getElementById('lEmail').value.trim(), p = document.getElementById('lPass').value;
  if (!e || !p) return showErr('Fill in all fields');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
  try { await AuthAPI.login(e, p); showApp(); await loadAll(); }
  catch (err) { showErr(err.message); }
  finally { btn.disabled = false; btn.innerHTML = 'Sign In'; }
}

async function doRegister() {
  const btn = document.getElementById('regBtn');
  const n = document.getElementById('rName').value.trim(), e = document.getElementById('rEmail').value.trim(), p = document.getElementById('rPass').value;
  if (!n || !e || !p) return showErr('Fill in all fields');
  if (p.length < 6) return showErr('Password must be at least 6 characters');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
  try { await AuthAPI.register(n, e, p); showApp(); await loadAll(); toast(`Welcome, ${n}! 🎉`, 'ok'); }
  catch (err) { showErr(err.message); }
  finally { btn.disabled = false; btn.innerHTML = 'Create Account'; }
}

function showErr(m) { const el = document.getElementById('authErr'); el.textContent = m; el.style.display = 'block'; }
document.addEventListener('keydown', e => { if (e.key === 'Enter' && document.getElementById('authScreen')?.style.display !== 'none') { if (document.getElementById('loginForm').style.display !== 'none') doLogin(); else doRegister(); } });

function goTo(pg) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + pg).classList.add('active');
  document.querySelector(`[data-page="${pg}"]`)?.classList.add('active');
  if (pg === 'analytics') renderAnalytics();
  if (pg === 'focus') renderFStats();
  if (pg === 'mentor') { if (!document.getElementById('pageChat').children.length) sendWelcome(); }
}

function setHeader() {
  const h = new Date().getHours(), u = Auth.getUser();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const em = h < 12 ? '☀️' : h < 17 ? '⚡' : '🌙';
  document.getElementById('dGreet').textContent = `${g}, ${u?.name?.split(' ')[0] || ''} ${em}`;
  document.getElementById('dDate').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function renderDash() {
  const a = S.analytics?.summary;
  if (a) {
    document.getElementById('sScore').textContent = a.todayScore ?? '—';
    document.getElementById('sStreak').textContent = a.currentStreak ?? '—';
    const totalDays = a.daysSinceJoined || 1;
    document.getElementById('sStreakD').textContent = `out of ${totalDays} day${totalDays !== 1 ? 's' : ''}`;
    document.getElementById('sHabits').textContent = a.doneToday ?? '—';
    document.getElementById('sHabitsD').textContent = `of ${a.totalHabits} today`;
    // Tasks stat card — today's tasks only
    const todayDone = a.tasksDueTodayDone ?? 0;
    const todayTotal = a.tasksDueToday ?? 0;
    document.getElementById('sTasks').textContent = `${todayDone}/${todayTotal}`;
    document.getElementById('sTasksD').textContent = 'due today';

    // Score card — habits + today tasks only
    document.getElementById('sScoreD').textContent = `habits ${a.doneToday}/${a.totalHabits} · tasks ${todayDone}/${todayTotal}`;
  }
  const hEl = document.getElementById('dHabits');
  hEl.innerHTML = S.habits.slice(0, 4).length ? S.habits.slice(0, 4).map(habitHTML).join('') : `<div class="empty-state"><div class="empty-icon">🌱</div><p>No habits yet</p></div>`;
  const tEl = document.getElementById('dTasks');
  const pend = S.tasks.filter(t => !t.done).slice(0, 4);
  tEl.innerHTML = pend.length ? pend.map(taskHTML).join('') : `<div class="empty-state"><div class="empty-icon">🎉</div><p>All tasks done!</p></div>`;
}

function habitHTML(h) {
  const pct = Math.min(100, Math.round((h.completions?.length || 0) / Math.max(h.targetDays, 1) * 100));
  return `<div class="habit-item ${h.doneToday ? 'done' : ''}">
    <div class="chk-circle" onclick="toggleHabit('${h.id}')">${h.doneToday ? '✓' : ''}</div>
    <div class="h-emoji">${h.icon}</div>
    <div class="h-body">
      <div class="h-name">${h.name}</div>
      <div class="h-meta"><span class="h-streak">🔥 ${h.streak}d streak</span><span class="h-cat">${h.category}</span></div>
    </div>
    <div class="h-bar-wrap"><div class="h-bar"><div class="h-bar-fill" style="width:${pct}%"></div></div><div class="h-pct">${pct}%</div></div>
    <button class="icon-btn" onclick="delHabit('${h.id}')">🗑</button>
  </div>`;
}

function renderHabits() {
  const el = document.getElementById('habitList');
  const f = S.hFilter === 'all' ? S.habits : S.habits.filter(h => h.category === S.hFilter);
  el.innerHTML = f.length ? f.map(habitHTML).join('') : `<div class="empty-state"><div class="empty-icon">🔁</div><p>No habits. Add one!</p></div>`;
}

async function toggleHabit(id) {
  try {
    const r = await HabitsAPI.complete(id);
    const i = S.habits.findIndex(h => h.id === id);
    if (i !== -1) S.habits[i] = r.habit;
    renderHabits(); renderDash();
    AnalyticsAPI.get().then(a => { S.analytics = a; renderDash(); updateBadges(); });
    toast(r.habit.doneToday ? `✓ ${r.habit.name} done!` : `Undone`, r.habit.doneToday ? 'ok' : '');
  } catch (e) { toast(e.message, 'err'); }
}

async function delHabit(id) {
  if (!confirm('Delete this habit?')) return;
  try { await HabitsAPI.delete(id); S.habits = S.habits.filter(h => h.id !== id); renderHabits(); renderDash(); updateBadges(); toast('Habit deleted'); }
  catch (e) { toast(e.message, 'err'); }
}

function filterH(f, el) { S.hFilter = f; document.querySelectorAll('#hPills .pill').forEach(p => p.classList.remove('active')); el.classList.add('active'); renderHabits(); }

function taskHTML(t) {
  const over = t.dueDate && !t.done && new Date(t.dueDate) < new Date();
  const tStr = t.dueTime ? `<span class="badge b-time">🕐 ${fmt12(t.dueTime)}</span>` : '';
  const dStr = t.dueDate ? `<span class="badge b-date ${over ? 'overdue' : ''}">📅 ${fmtDate(t.dueDate)}</span>` : '';
  return `<div class="task-item ${t.done ? 'done' : ''}">
    <div class="chk-sq" onclick="toggleTask('${t.id}',${!t.done})">${t.done ? '✓' : ''}</div>
    <div class="t-body">
      <div class="t-title">${t.title}</div>
      ${t.notes ? `<div class="t-notes">${t.notes}</div>` : ''}
      <div class="t-meta"><span class="badge b-${t.priority}">${t.priority}</span>${dStr}${tStr}</div>
    </div>
    <button class="icon-btn" onclick="delTask('${t.id}')">🗑</button>
  </div>`;
}

function renderTasks() {
  const el = document.getElementById('taskList');
  let f = S.tasks;
  if (S.tFilter === 'active') f = f.filter(t => !t.done);
  else if (S.tFilter === 'done') f = f.filter(t => t.done);
  else if (['high', 'medium', 'low'].includes(S.tFilter)) f = f.filter(t => t.priority === S.tFilter);
  const prioW = { high: 0, medium: 1, low: 2 };

  function taskScore(t) {
    if (t.done) return 9999;
    let score = prioW[t.priority] * 10;
    if (t.dueDate) {
      const now = new Date();
      const due = new Date(t.dueDate);
      const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) score -= 20;       // overdue — highest urgency
      else if (diffDays === 0) score -= 8;  // due today
      else if (diffDays === 1) score -= 4;  // due tomorrow
      else if (diffDays <= 3) score -= 2;   // due this week
    }
    return score;
  }

  f.sort((a, b) => taskScore(a) - taskScore(b));
  el.innerHTML = f.length ? f.map(taskHTML).join('') : `<div class="empty-state"><div class="empty-icon">📋</div><p>No tasks. Add one!</p></div>`;
}

async function toggleTask(id, done) {
  try {
    const r = await TasksAPI.toggle(id, done);
    const i = S.tasks.findIndex(t => t.id === id);
    if (i !== -1) S.tasks[i] = r.task;
    renderTasks(); renderDash(); updateBadges();
    if (done) toast('✓ Task complete!', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function delTask(id) {
  if (!confirm('Delete this task?')) return;
  try { await TasksAPI.delete(id); S.tasks = S.tasks.filter(t => t.id !== id); renderTasks(); renderDash(); updateBadges(); toast('Task deleted'); }
  catch (e) { toast(e.message, 'err'); }
}

function filterT(f, el) { S.tFilter = f; document.querySelectorAll('#tPills .pill').forEach(p => p.classList.remove('active')); el.classList.add('active'); renderTasks(); }

function renderAnalytics() {
  const a = S.analytics; if (!a) return;
  const s = a.summary;
  document.getElementById('aTop').innerHTML = `
    <div class="a-card">
      <svg width="80" height="80" style="margin:0 auto;display:block">
        <circle cx="40" cy="40" r="34" fill="none" stroke="var(--bg2)" stroke-width="6"/>
        <circle cx="40" cy="40" r="34" fill="none" stroke="var(--primary)" stroke-width="6"
          stroke-dasharray="214" stroke-dashoffset="${214 - (214 * s.completionRate / 100)}"
          stroke-linecap="round" transform="rotate(-90 40 40)"/>
        <text x="40" y="37" text-anchor="middle" font-family="Inter,sans-serif" font-weight="700" font-size="14" fill="var(--ink)">${s.completionRate}%</text>
        <text x="40" y="51" text-anchor="middle" font-family="Inter,sans-serif" font-size="8" fill="var(--ink3)">TODAY</text>
      </svg>
      <div class="a-lbl">Habit Completion</div>
      <div class="a-sub">${s.doneToday} of ${s.totalHabits} habits</div>
    </div>
    <div class="a-card"><div class="a-val" style="color:var(--amber)">${s.currentStreak}</div><div class="a-lbl">Day Streak 🔥</div><div class="a-sub">${s.currentStreak} of ${s.daysSinceJoined || 1} days active</div>${s.bestHabit ? `<div class="a-sub" style="margin-top:2px">Best habit: ${s.bestHabit.name} (${s.bestHabit.streak}d)</div>` : ''}</div>
    <div class="a-card">
      <div class="a-val" style="color:var(--primary)">${s.todayScore}</div>
      <div class="a-lbl">Today's Score</div>
      <div class="a-sub">habits: ${s.doneToday}/${s.totalHabits}</div>
      <div class="a-sub" style="margin-top:2px">today's tasks: ${s.tasksDueTodayDone}/${s.tasksDueToday}</div>
    </div>`;
  const mx = Math.max(...a.weeklyData.map(d => d.rate), 1);
  document.getElementById('aBars').innerHTML = a.weeklyData.map(d => `<div class="bar-wrap"><div class="bar-col" style="height:${(d.rate / mx) * 84}px" title="${d.label}: ${d.rate}%"></div><div class="bar-day">${d.label}</div></div>`).join('');
  // Generate day labels based on actual first row dates
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const firstRowDays = a.heatmap.slice(0,7).map(d => dayNames[new Date(d.date).getDay()].charAt(0));
  document.getElementById('heatDayLabels').innerHTML = firstRowDays.map(d => `<div class="heat-day">${d}</div>`).join('');

  // Exactly 28 cells = 4 rows of 7, no padding needed
  // Day labels (M T W T F S S) show week order, cells go left to right day by day
  const cells = a.heatmap.map(d => {
    const pct = d.pct || 0;
    const lv = pct === 0 ? 0 : pct <= 25 ? 1 : pct <= 50 ? 2 : pct <= 75 ? 3 : 4;
    const habitStr = `habits: ${d.habitsCount}/${d.habitsTotal}`;
    const taskStr = d.tasksTotal > 0 ? ` | tasks: ${d.tasksDone}/${d.tasksTotal}` : '';
    const label = `${d.date} — ${habitStr}${taskStr} (${pct}%)`;
    return `<div class="h-cell h${lv}" title="${label}"></div>`;
  }).join('');
  document.getElementById('aHeat').innerHTML = cells;
  document.getElementById('aInsights').innerHTML = genInsights(s, a.weeklyData).map(i => `<div class="insight ${i.t}"><div class="insight-title">${i.title}</div><div class="insight-body">${i.body}</div></div>`).join('');
}

function genInsights(s, w) {
  const ins = [];
  if (s.currentStreak >= 7) ins.push({ t: 'good', title: '🔥 Great Streak!', body: `${s.currentStreak} days in a row. Keep going!` });
  else if (s.currentStreak > 0) ins.push({ t: 'info', title: `🌱 ${s.currentStreak}-Day Streak`, body: '21 days makes it automatic.' });
  else ins.push({ t: 'warn', title: '🔔 No Streak Yet', body: 'Complete one habit to get started.' });
  if (s.completionRate === 100) ins.push({ t: 'good', title: '🏆 Perfect Day!', body: 'All habits done. Outstanding!' });
  else if (s.completionRate >= 60) ins.push({ t: 'info', title: '⚡ Good Progress', body: `${s.completionRate}% done. Finish strong!` });
  else if (s.totalHabits > 0) ins.push({ t: 'warn', title: '⚠ Behind Today', body: `Only ${s.completionRate}% done. Try one more now.` });
  const best = [...w].sort((a, b) => b.rate - a.rate)[0];
  if (best?.rate > 0) ins.push({ t: 'info', title: '📊 Peak Day', body: `Best this week: ${best.label} at ${best.rate}%.` });
  if (s.tasksCompleted > 0) ins.push({ t: 'good', title: '✅ Tasks Moving', body: `${s.tasksCompleted} done, ${s.totalTasks - s.tasksCompleted} remaining.` });
  return ins;
}

const FM = { pomodoro: { lbl: 'Pomodoro · 25 minutes', mins: 25 }, short: { lbl: 'Short Break · 5 minutes', mins: 5 }, long: { lbl: 'Long Break · 15 minutes', mins: 15 }, deep: { lbl: 'Deep Work · 50 minutes', mins: 50 } };
let FS = { running: false, secs: 25 * 60, mode: 'pomodoro', iv: null, todaySess: 0 };

function setMode(m, el) {
  if (FS.running) return;
  FS.mode = m;
  FS.secs = FM[m].mins * 60;
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  tickClock();
  document.getElementById('fSub').textContent = FM[m].lbl;
  document.getElementById('fLabel').textContent = 'READY';
  document.getElementById('fBtn').textContent = '▶ Start';
  document.getElementById('fClock').classList.remove('active');
}

function fToggle() {
  if (FS.running) {
    clearInterval(FS.iv); FS.running = false;
    document.getElementById('fBtn').textContent = '▶ Resume';
    document.getElementById('fClock').classList.remove('active');
    document.getElementById('fLabel').textContent = 'PAUSED';
  } else {
    FS.running = true;
    document.getElementById('fBtn').textContent = '⏸ Pause';
    document.getElementById('fClock').classList.add('active');
    document.getElementById('fLabel').textContent = 'FOCUS MODE';
    document.getElementById('modeRow').style.opacity = '0.4';
    document.getElementById('modeRow').style.pointerEvents = 'none';
    FS.iv = setInterval(async () => {
      FS.secs--; tickClock();
      if (FS.secs <= 0) {
        clearInterval(FS.iv); FS.running = false;
        document.getElementById('fBtn').textContent = '▶ Start';
        document.getElementById('fClock').classList.remove('active');
        document.getElementById('modeRow').style.opacity = '';
        document.getElementById('modeRow').style.pointerEvents = '';
        const isFocus = FS.mode === 'pomodoro' || FS.mode === 'deep';
        if (isFocus) {
          FS.todaySess++;
          document.getElementById('fLabel').textContent = 'SESSION DONE ✅';
          toast(`🎯 ${FM[FS.mode].lbl} complete! Take a short break.`, 'ok');
          try { await SessionsAPI.log(FM[FS.mode].mins, FS.mode); S.sessions = await SessionsAPI.getAll(); renderFStats(); } catch {}
        } else {
          document.getElementById('fLabel').textContent = 'BREAK OVER ☕';
          toast('Break done! Start your next focus session.', 'ok');
        }
      }
    }, 1000);
  }
}

function fReset() {
  clearInterval(FS.iv); FS.running = false; FS.secs = FM[FS.mode].mins * 60;
  tickClock(); document.getElementById('fBtn').textContent = '▶ Start';
  document.getElementById('fClock').classList.remove('active');
  document.getElementById('fLabel').textContent = 'READY';
  document.getElementById('modeRow').style.opacity = '';
  document.getElementById('modeRow').style.pointerEvents = '';
}

function tickClock() {
  const m = String(Math.floor(FS.secs / 60)).padStart(2, '0'), s = String(FS.secs % 60).padStart(2, '0');
  document.getElementById('fClock').textContent = `${m}:${s}`;
}

function renderFStats() {
  const today = new Date().toDateString();
  // only count actual focus sessions (pomodoro/deep) — not breaks
  const focusSessions = S.sessions.sessions.filter(s =>
    (s.type === 'pomodoro' || s.type === 'deep') &&
    new Date(s.completedAt).toDateString() === today
  );
  document.getElementById('fTotal').textContent = S.sessions.totalSessions;
  document.getElementById('fMins').textContent = S.sessions.totalMinutes;
  document.getElementById('fToday').textContent = focusSessions.length;
}

function buildClockSVG(id) {
  const c = document.getElementById(id); if (!c) return;
  const isHr = S.clockMode === 'hour';
  const nums = isHr ? [12,1,2,3,4,5,6,7,8,9,10,11] : [0,5,10,15,20,25,30,35,40,45,50,55];
  const val = isHr ? S.clockHr : S.clockMin;
  const angle = isHr ? (val % 12 / 12) * 360 : (val / 60) * 360;
  const hLen = isHr ? 55 : 68;
  const rad = (angle - 90) * Math.PI / 180;
  const hx = 90 + hLen * Math.cos(rad), hy = 90 + hLen * Math.sin(rad);
  let ns = '';
  nums.forEach((n, i) => {
    const a = (i / 12 * 360 - 90) * Math.PI / 180;
    const nx = 90 + 68 * Math.cos(a), ny = 90 + 68 * Math.sin(a);
    const active = isHr ? (n === val || (val === 0 && n === 12)) : n === val;
    ns += `<circle cx="${nx}" cy="${ny}" r="13" fill="${active ? '#2563eb' : 'transparent'}" style="cursor:pointer" data-v="${n}"/>
    <text x="${nx}" y="${ny}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="${active ? '700' : '400'}" fill="${active ? '#fff' : '#374151'}" style="cursor:pointer;pointer-events:none">${n}</text>`;
  });
  c.innerHTML = `<svg width="180" height="180" style="cursor:pointer" onclick="clockClick(event,this)">
    <circle cx="90" cy="90" r="80" fill="#f3f4f6" stroke="#e5e7eb" stroke-width="1"/>
    <line x1="90" y1="90" x2="${hx}" y2="${hy}" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>
    <circle cx="90" cy="90" r="5" fill="#2563eb"/>
    <circle cx="${hx}" cy="${hy}" r="8" fill="#2563eb"/>
    ${ns}
  </svg>`;
}

function clockClick(e, svg) {
  const rect = svg.getBoundingClientRect();
  const dx = e.clientX - (rect.left + rect.width / 2), dy = e.clientY - (rect.top + rect.height / 2);
  let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  if (angle < 0) angle += 360;
  if (S.clockMode === 'hour') { let h = Math.round(angle / 30) % 12; S.clockHr = h === 0 ? 12 : h; }
  else { S.clockMin = Math.round(angle / 6) % 60; }
  updateClockDisp(); buildClockSVG('clockSvgWrap');
}

function updateClockDisp() {
  const el = document.getElementById('clockDisp'); if (!el) return;
  el.innerHTML = `<span>${String(S.clockHr).padStart(2,'0')}</span>:<span>${String(S.clockMin).padStart(2,'0')}</span> <span style="font-size:18px">${S.clockAmpm}</span>`;
}

function setClockMode(m) {
  S.clockMode = m;
  document.getElementById('clockTabHr')?.classList.toggle('active', m === 'hour');
  document.getElementById('clockTabMn')?.classList.toggle('active', m === 'minute');
  buildClockSVG('clockSvgWrap');
}

function setAmpm(ap) {
  S.clockAmpm = ap;
  document.getElementById('ampmAM')?.classList.toggle('active', ap === 'AM');
  document.getElementById('ampmPM')?.classList.toggle('active', ap === 'PM');
}

function getClockVal() {
  let h = S.clockHr;
  if (S.clockAmpm === 'PM' && h !== 12) h += 12;
  if (S.clockAmpm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2,'0')}:${String(S.clockMin).padStart(2,'0')}`;
}

function toggleClockPicker() {
  S.clockOpen = !S.clockOpen;
  const pop = document.getElementById('clockPopup');
  if (S.clockOpen) { pop.classList.add('open'); setTimeout(() => { buildClockSVG('clockSvgWrap'); updateClockDisp(); }, 50); }
  else pop.classList.remove('open');
}

function confirmTime() {
  const val = getClockVal();
  const trig = document.getElementById('clockTrigger');
  trig.innerHTML = `🕐 ${fmt12(val)}`; trig.classList.add('has-time');
  document.getElementById('hiddenTime').value = val;
  S.clockOpen = false; document.getElementById('clockPopup').classList.remove('open');
}

function clearTime() {
  document.getElementById('clockTrigger').innerHTML = '🕐 Set a time';
  document.getElementById('clockTrigger').classList.remove('has-time');
  document.getElementById('hiddenTime').value = '';
  S.clockHr = 12; S.clockMin = 0; S.clockAmpm = 'AM'; S.clockOpen = false;
  document.getElementById('clockPopup').classList.remove('open');
}

const EMOJIS = ['⚡','🌿','💪','🧠','📚','🏃','💧','🥗','😴','🎯','💼','🎨','🎵','🏋️','🧘','☀️','🌙','❤️','🚀','🎸'];

function openHabitModal() {
  S.emoji = '⚡';
  document.getElementById('mTitle').textContent = 'New Habit';
  document.getElementById('mBody').innerHTML = `
    <div class="field"><label>Habit Name</label><input type="text" id="hName" placeholder="e.g. Morning run, Read 20 pages"/></div>
    <div class="form-row">
      <div class="field"><label>Category</label><select id="hCat"><option value="health">🌿 Health</option><option value="mind">🧠 Mind</option><option value="work">💼 Work</option><option value="general">⚡ General</option></select></div>
      <div class="field"><label>Target Days</label><input type="number" id="hTarget" value="30" min="1" max="365"/></div>
    </div>
    <div class="field"><label>Icon</label><div class="emoji-grid">${EMOJIS.map(e => `<div class="em ${e === '⚡' ? 'sel' : ''}" onclick="pickEmoji('${e}',this)">${e}</div>`).join('')}</div></div>
    <div class="modal-foot"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-submit" onclick="submitHabit()">Add Habit</button></div>`;
  openModal(); setTimeout(() => document.getElementById('hName').focus(), 80);
}

function openTaskModal() {
  S.clockHr = 12; S.clockMin = 0; S.clockAmpm = 'AM'; S.clockMode = 'hour'; S.clockOpen = false;
  document.getElementById('mTitle').textContent = 'New Task';
  document.getElementById('mBody').innerHTML = `
    <div class="field"><label>Task Title</label><input type="text" id="tTitle" placeholder="e.g. Send weekly report"/></div>
    <div class="form-row">
      <div class="field"><label>Priority</label><select id="tPrio"><option value="high">🔴 High</option><option value="medium" selected>🟡 Medium</option><option value="low">🟢 Low</option></select></div>
      <div class="field"><label>Due Date</label><input type="date" id="tDate"/></div>
    </div>
    <div class="field">
      <label>Due Time <span style="color:var(--ink4);font-weight:400">(optional)</span></label>
      <input type="hidden" id="hiddenTime"/>
      <div id="clockTrigger" class="clock-trigger" onclick="toggleClockPicker()">🕐 Set a time</div>
      <div class="clock-popup" id="clockPopup">
        <div class="clock-tabs"><button class="clock-tab active" id="clockTabHr" onclick="setClockMode('hour')">Hour</button><button class="clock-tab" id="clockTabMn" onclick="setClockMode('minute')">Minute</button></div>
        <div class="clock-display" id="clockDisp"><span>12</span>:<span>00</span> <span style="font-size:18px">AM</span></div>
        <div id="clockSvgWrap" style="margin-bottom:14px"></div>
        <div class="ampm-row"><button class="ampm-btn active" id="ampmAM" onclick="setAmpm('AM')">AM</button><button class="ampm-btn" id="ampmPM" onclick="setAmpm('PM')">PM</button></div>
        <button class="clock-confirm" onclick="confirmTime()">Confirm Time</button>
        <button class="clock-clear" onclick="clearTime()">Clear</button>
      </div>
    </div>
    <div class="field"><label>Notes <span style="color:var(--ink4);font-weight:400">(optional)</span></label><textarea id="tNotes" placeholder="Any extra context..."></textarea></div>
    <div class="modal-foot"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-submit" onclick="submitTask()">Add Task</button></div>`;
  openModal(); setTimeout(() => document.getElementById('tTitle').focus(), 80);
}

function pickEmoji(e, el) { S.emoji = e; document.querySelectorAll('.em').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); }

async function submitHabit() {
  const name = document.getElementById('hName').value.trim();
  if (!name) { alert('Enter a habit name'); return; }
  try {
    const r = await HabitsAPI.create({ name, category: document.getElementById('hCat').value, icon: S.emoji, targetDays: parseInt(document.getElementById('hTarget').value) || 30 });
    S.habits.unshift(r.habit); closeModal(); renderHabits(); renderDash(); updateBadges(); toast(`🎉 "${name}" added!`, 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function submitTask() {
  const title = document.getElementById('tTitle').value.trim();
  if (!title) { alert('Enter a task title'); return; }
  try {
    const r = await TasksAPI.create({ title, priority: document.getElementById('tPrio').value, dueDate: document.getElementById('tDate').value || null, dueTime: document.getElementById('hiddenTime').value || null, notes: document.getElementById('tNotes').value.trim() });
    S.tasks.unshift(r.task); closeModal(); renderTasks(); renderDash(); updateBadges(); toast('📝 Task added!', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function openModal() { document.getElementById('overlay').classList.add('open'); }
function closeModal() { document.getElementById('overlay').classList.remove('open'); S.clockOpen = false; }
function closeOut(e) { if (e.target.id === 'overlay') closeModal(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

const SUGGESTIONS = {
  general: [
    { label: '📊 How am I doing?', msg: 'how am i doing' },
    { label: '🎯 What to do now?', msg: 'what should i do now' },
    { label: '📈 My progress report', msg: 'give me my progress report' }
  ],
  habits: [
    { label: '🔁 Check my habits', msg: 'check my habits' },
    { label: '🔥 My streak status', msg: 'streak' },
    { label: '🏆 My best habit', msg: 'my best habit' },
    { label: '⚠️ Habits I missed', msg: 'which habits did i miss' }
  ],
  tasks: [
    { label: '✅ My tasks status', msg: 'my tasks status' },
    { label: '🔴 High priority tasks', msg: 'what are my high priority tasks' },
    { label: '📅 Any overdue tasks?', msg: 'do i have overdue tasks' },
    { label: '🎯 Focus on what?', msg: 'what task should i focus on' }
  ],
  motivation: [
    { label: '💪 Motivate me', msg: 'motivate me' },
    { label: '😴 I feel tired', msg: 'tired' },
    { label: '😓 I am struggling', msg: 'struggling' },
    { label: '💡 Give me advice', msg: 'give me advice' }
  ],
  focus: [
    { label: '🎯 Focus session tips', msg: 'focus session tips' },
    { label: '⏱ My focus time', msg: 'how much have i focused' }
  ]
};
let activeTab = 'general';

function renderSuggs(cId, mId) {
  const c = document.getElementById(cId); if (!c) return;
  const catLabels = { general: '⚡ General', habits: '🔁 Habits', tasks: '✅ Tasks', motivation: '💪 Motivation', focus: '🎯 Focus' };
  const tabs = Object.keys(catLabels).map(cat => {
    const on = cat === activeTab;
    return `<button onclick="switchTab2('${cat}','${cId}','${mId}')" style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;border:1.5px solid ${on ? 'var(--primary)' : 'var(--border)'};background:${on ? 'var(--primary)' : 'var(--surface)'};color:${on ? '#fff' : 'var(--ink2)'};transition:all .15s;margin-bottom:4px">${catLabels[cat]}</button>`;
  }).join('');
  const btns = (SUGGESTIONS[activeTab] || SUGGESTIONS.general).map(s => `<button class="suggestion" onclick="quickSend('${s.msg}','${mId}','${cId}')">${s.label}</button>`).join('');
  c.innerHTML = `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;padding-bottom:8px;border-bottom:1px solid var(--border);width:100%">${tabs}</div>${btns}`;
}

function switchTab2(cat, cId, mId) { activeTab = cat; renderSuggs(cId, mId); }

function toggleChat() {
  S.chatOpen = !S.chatOpen;
  document.getElementById('chatPanel').classList.toggle('open', S.chatOpen);
}

function showLoginGuide() {
  const msgs = document.getElementById('chatMsgs');
  if (msgs) msgs.innerHTML = '';
  const suggs = document.getElementById('chatSuggs');
  if (suggs) suggs.innerHTML = '';
  document.getElementById('chatName').textContent = 'Brot Guide';
  document.getElementById('chatStatus').textContent = 'Here to help you get started';
  appendMsg('bot', '👋 Welcome to Brot!\n\nI am your setup guide. Are you a new user or do you already have an account?', 'chatMsgs');
  if (suggs) suggs.innerHTML = `
    <button class="suggestion" onclick="showNewUserGuide()">🆕 New user</button>
    <button class="suggestion" onclick="showExistingUserGuide()">👤 Already have account</button>
    <button class="suggestion" onclick="showFeaturesGuide()">✨ What can Brot do?</button>`;
}

function showNewUserGuide() {
  appendMsg('user', "I'm a new user", 'chatMsgs');
  appendMsg('bot', 'Welcome! 🎉 Here is how to create your account:\n\n1️⃣ Click the "Create Account" tab above\n2️⃣ Enter your full name\n3️⃣ Enter your email address\n4️⃣ Set a password (minimum 6 characters)\n5️⃣ Click "Create Account"\n\nThat is it — you will be logged in instantly with your dashboard ready!', 'chatMsgs');
  const suggs = document.getElementById('chatSuggs');
  if (suggs) suggs.innerHTML = `
    <button class="suggestion" onclick="showFeaturesGuide()">✨ What can Brot do?</button>
    <button class="suggestion" onclick="showLoginGuide()">↩ Back</button>`;
}

function showExistingUserGuide() {
  appendMsg('user', "I already have an account", 'chatMsgs');
  appendMsg('bot', 'Welcome back! 👋 Here is how to sign in:\n\n1️⃣ The "Sign In" tab is selected by default\n2️⃣ Enter your registered email address\n3️⃣ Enter your password\n4️⃣ Click "Sign In"\n\nAll your habits, tasks, streaks and progress will be right where you left them!', 'chatMsgs');
  const suggs = document.getElementById('chatSuggs');
  if (suggs) suggs.innerHTML = `
    <button class="suggestion" onclick="showFeaturesGuide()">✨ What can Brot do?</button>
    <button class="suggestion" onclick="showLoginGuide()">↩ Back</button>`;
}

function showFeaturesGuide() {
  appendMsg('user', "What can Brot do?", 'chatMsgs');
  appendMsg('bot', 'Here is everything Brot can do:\n\n🔁 **Habits** — Track daily habits with streaks, categories and progress\n\n✅ **Tasks** — Manage tasks with priority levels, due dates and times\n\n🎯 **Focus Timer** — Pomodoro sessions: 25 min focus, 5 min break, 15 min break, 50 min deep work\n\n📊 **Analytics** — Heatmap, weekly chart, score ring and insights\n\n🤖 **AI Mentor** — Personal coach using your real data to give personalized advice\n\n⚡ **Daily Score** — Calculated from habits done + today tasks completed', 'chatMsgs');
  const suggs = document.getElementById('chatSuggs');
  if (suggs) suggs.innerHTML = `
    <button class="suggestion" onclick="showNewUserGuide()">🆕 How to sign up</button>
    <button class="suggestion" onclick="showExistingUserGuide()">👤 How to sign in</button>
    <button class="suggestion" onclick="showLoginGuide()">↩ Back</button>`;
}

function sendWelcome() {
  const u = Auth.getUser();
  // switch chat panel to mentor mode
  const cn = document.getElementById('chatName');
  const cs = document.getElementById('chatStatus');
  if (cn) cn.textContent = 'Brot Mentor';
  if (cs) cs.textContent = 'Online · Knows your data';
  const msg = `Hi${u ? ', ' + u.name.split(' ')[0] : ''}! 👋 I'm your Brot Mentor. I know your habits, tasks, and progress — use the buttons below to ask me anything.\n\nTry "How am I doing?" for a full report.`;
  appendMsg('bot', msg, 'chatMsgs');
  renderSuggs('chatSuggs', 'chatMsgs');
  appendMsg('bot', msg, 'pageChat');
  renderSuggs('pageSugg', 'pageChat');
}

function quickSend(msg, mId, cId) {
  appendMsg('user', msg, mId);
  document.getElementById(cId).innerHTML = '';
  askMentor(msg, mId, cId);
}

async function askMentor(msg, mId, cId) {
  const tId = 'typing-' + Date.now();
  const tEl = document.createElement('div'); tEl.className = 'msg bot'; tEl.id = tId;
  tEl.innerHTML = '<div class="typing-bubble"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  const container = document.getElementById(mId);
  container.appendChild(tEl); container.scrollTop = container.scrollHeight;
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Auth.getToken() }, body: JSON.stringify({ message: msg }) });
    const data = await res.json();
    document.getElementById(tId)?.remove();
    appendMsg('bot', data.reply || 'Sorry, try again!', mId);
    renderSuggs(cId, mId);
  } catch {
    document.getElementById(tId)?.remove();
    appendMsg('bot', 'Could not connect. Make sure the server is running.', mId);
  }
}

function appendMsg(role, text, cId) {
  const c = document.getElementById(cId); if (!c) return;
  const div = document.createElement('div'); div.className = `msg ${role}`;
  const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const fmt = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  div.innerHTML = `<div class="msg-bubble">${fmt}</div><div class="msg-time">${now}</div>`;
  c.appendChild(div); c.scrollTop = c.scrollHeight;
}

function updateBadges() {
  const uh = S.habits.filter(h => !h.doneToday).length, ut = S.tasks.filter(t => !t.done).length;
  const hb = document.getElementById('hBadge'), tb = document.getElementById('tBadge');
  hb.textContent = uh; hb.style.display = uh ? '' : 'none';
  tb.textContent = ut; tb.style.display = ut ? '' : 'none';
}

function fmtDate(d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmt12(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM', hr = h % 12 || 12; return `${hr}:${String(m).padStart(2, '0')} ${ap}`; }

function toast(msg, type = '') {
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}
function setupMobileAddButton() {
  const btn = document.getElementById("mobileAddBtn");
  if (!btn) return;

  function updateVisibility() {
    const habitsPage = document.getElementById("page-habits");
    const tasksPage = document.getElementById("page-tasks");

    if (
      habitsPage.classList.contains("active") ||
      tasksPage.classList.contains("active")
    ) {
      btn.style.display = "flex";
    } else {
      btn.style.display = "none";
    }
  }

  btn.onclick = () => {
    if (document.getElementById("page-habits").classList.contains("active")) {
      openHabitModal();
    } else if (document.getElementById("page-tasks").classList.contains("active")) {
      openTaskModal();
    }
  };

  // Run initially
  updateVisibility();

  // Run every time page changes
  setInterval(updateVisibility, 300);
}

setTimeout(setupMobileAddButton, 500);
boot();