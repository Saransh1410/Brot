const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "db.json");
const SECRET = "brot_2026_secret";

function readDB() {
  if (!fs.existsSync(DB)) {
    const blank = { users: [], habits: [], tasks: [], sessions: [] };
    fs.writeFileSync(DB, JSON.stringify(blank, null, 2));
    return blank;
  }
  return JSON.parse(fs.readFileSync(DB, "utf8"));
}

function saveDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

function hashPwd(pwd) {
  return crypto.createHmac("sha256", SECRET).update(pwd).digest("hex");
}

function makeToken(userId) {
  const payload = { userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64");
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("hex");
  return `${data}.${sig}`;
}

function checkToken(token) {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(data).digest("hex");
  if (expected !== sig) return null;
  const payload = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  if (payload.exp < Date.now()) return null;
  return payload;
}

function getUser(req) {
  const auth = req.headers["authorization"] || "";
  return checkToken(auth.replace("Bearer ", "").trim());
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  });
  res.end(JSON.stringify(data));
}

function body(req) {
  return new Promise(resolve => {
    let raw = "";
    req.on("data", c => (raw += c));
    req.on("end", () => {
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

function serveStatic(res, filePath, type) {
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end("Not found"); return; }
  res.writeHead(200, { "Content-Type": type });
  res.end(fs.readFileSync(filePath));
}

async function register(req, res) {
  const { name, email, password } = await body(req);
  if (!name || !email || !password) return send(res, 400, { error: "All fields required" });
  const db = readDB();
  if (db.users.find(u => u.email === email)) return send(res, 409, { error: "Email already registered" });
  const user = {
    id: crypto.randomUUID(), name, email,
    password: hashPwd(password),
    streak: 0,
    lastActive: new Date().toDateString(),
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  saveDB(db);
  const token = makeToken(user.id);
  send(res, 201, { token, user: { id: user.id, name: user.name, email: user.email, streak: user.streak } });
}

async function login(req, res) {
  const { email, password } = await body(req);
  const db = readDB();
  const user = db.users.find(u => u.email === email && u.password === hashPwd(password));
  if (!user) return send(res, 401, { error: "Invalid email or password" });
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (user.lastActive === yesterday) user.streak = (user.streak || 0) + 1;
  else if (user.lastActive !== today) user.streak = 1;
  user.lastActive = today;
  saveDB(db);
  send(res, 200, { token: makeToken(user.id), user: { id: user.id, name: user.name, email: user.email, streak: user.streak } });
}

function me(req, res) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const db = readDB();
  const user = db.users.find(u => u.id === auth.userId);
  if (!user) return send(res, 404, { error: "User not found" });
  send(res, 200, { user: { id: user.id, name: user.name, email: user.email, streak: user.streak } });
}

function getHabits(req, res) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const db = readDB();
  const today = new Date().toDateString();
  const habits = db.habits
    .filter(h => h.userId === auth.userId)
    .map(h => ({ ...h, doneToday: h.completions?.includes(today) || false }));
  send(res, 200, { habits });
}

async function createHabit(req, res) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const { name, category, icon, targetDays } = await body(req);
  if (!name) return send(res, 400, { error: "Habit name required" });
  const habit = {
    id: crypto.randomUUID(), userId: auth.userId,
    name, category: category || "general", icon: icon || "⚡",
    targetDays: targetDays || 30,
    streak: 0, longestStreak: 0, completions: [],
    createdAt: new Date().toISOString()
  };
  const db = readDB();
  db.habits.push(habit);
  saveDB(db);
  send(res, 201, { habit: { ...habit, doneToday: false } });
}

function toggleHabit(req, res, id) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const db = readDB();
  const habit = db.habits.find(h => h.id === id && h.userId === auth.userId);
  if (!habit) return send(res, 404, { error: "Habit not found" });
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (habit.completions.includes(today)) {
    habit.completions = habit.completions.filter(d => d !== today);
    habit.streak = Math.max(0, habit.streak - 1);
  } else {
    habit.completions.push(today);
    habit.streak = habit.completions.includes(yesterday) ? habit.streak + 1 : 1;
    if (habit.streak > habit.longestStreak) habit.longestStreak = habit.streak;
  }
  saveDB(db);
  send(res, 200, { habit: { ...habit, doneToday: habit.completions.includes(today) } });
}

function deleteHabit(req, res, id) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const db = readDB();
  const idx = db.habits.findIndex(h => h.id === id && h.userId === auth.userId);
  if (idx === -1) return send(res, 404, { error: "Habit not found" });
  db.habits.splice(idx, 1);
  saveDB(db);
  send(res, 200, { success: true });
}

function getTasks(req, res) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const db = readDB();
  send(res, 200, { tasks: db.tasks.filter(t => t.userId === auth.userId) });
}

async function createTask(req, res) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const { title, priority, dueDate, dueTime, notes } = await body(req);
  if (!title) return send(res, 400, { error: "Task title required" });
  const task = {
    id: crypto.randomUUID(), userId: auth.userId,
    title, priority: priority || "medium",
    dueDate: dueDate || null, dueTime: dueTime || null,
    notes: notes || "", done: false,
    createdAt: new Date().toISOString(), completedAt: null
  };
  const db = readDB();
  db.tasks.push(task);
  saveDB(db);
  send(res, 201, { task });
}

async function updateTask(req, res, id) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const data = await body(req);
  const db = readDB();
  const task = db.tasks.find(t => t.id === id && t.userId === auth.userId);
  if (!task) return send(res, 404, { error: "Task not found" });
  Object.assign(task, data);
  if (data.done === true && !task.completedAt) task.completedAt = new Date().toISOString();
  if (data.done === false) task.completedAt = null;
  saveDB(db);
  send(res, 200, { task });
}

function deleteTask(req, res, id) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const db = readDB();
  const idx = db.tasks.findIndex(t => t.id === id && t.userId === auth.userId);
  if (idx === -1) return send(res, 404, { error: "Task not found" });
  db.tasks.splice(idx, 1);
  saveDB(db);
  send(res, 200, { success: true });
}

function getAnalytics(req, res) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const db = readDB();
  const habits = db.habits.filter(h => h.userId === auth.userId);
  const tasks = db.tasks.filter(t => t.userId === auth.userId);
  const today = new Date().toDateString();
  const weeklyData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const ds = d.toDateString();
    const label = d.toLocaleDateString("en", { weekday: "short" });
    const completed = habits.filter(h => h.completions?.includes(ds)).length;
    const rate = habits.length > 0 ? Math.round((completed / habits.length) * 100) : 0;
    weeklyData.push({ label, completed, total: habits.length, rate });
  }
  const heatmap = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const ds = d.toDateString();
    const dayISO = d.toISOString().split('T')[0];

    // habits completed on this day
    const habitsOnDay = habits.filter(h => h.completions?.includes(ds)).length;
    const habitPct = habits.length > 0 ? (habitsOnDay / habits.length) * 100 : 0;

    // tasks completed on this day (by completedAt date)
    const tasksDueOnDay = tasks.filter(t => t.dueDate === dayISO);
    const tasksDoneOnDay = tasksDueOnDay.filter(t => t.done && t.completedAt && new Date(t.completedAt).toISOString().split('T')[0] === dayISO).length;
    const taskPct = tasksDueOnDay.length > 0 ? (tasksDoneOnDay / tasksDueOnDay.length) * 100 : null;

    // combined: average of habit% and task% (only include tasks if any were due that day)
    const pct = taskPct !== null
      ? Math.round((habitPct + taskPct) / 2)
      : Math.round(habitPct);

    heatmap.push({
      date: ds,
      pct,
      habitsCount: habitsOnDay,
      habitsTotal: habits.length,
      tasksDone: tasksDoneOnDay,
      tasksTotal: tasksDueOnDay.length
    });
  }
  const doneToday = habits.filter(h => h.completions?.includes(today)).length;
  const tasksCompleted = tasks.filter(t => t.done).length;

  // Use YYYY-MM-DD format to match how dueDate is stored from the date input
  const todayISO = new Date().toISOString().split('T')[0];
  const tasksDueToday = tasks.filter(t => t.dueDate && t.dueDate === todayISO);
  const tasksDueTodayDone = tasksDueToday.filter(t => t.done).length;
  const tasksDueTodayTotal = tasksDueToday.length;

  // If no tasks are due today, only habits count (out of 100)
  const todayScore = habits.length > 0
    ? tasksDueTodayTotal > 0
      ? Math.round((doneToday / habits.length) * 50 + (tasksDueTodayDone / tasksDueTodayTotal) * 50)
      : Math.round((doneToday / habits.length) * 100)
    : tasksDueTodayTotal > 0
      ? Math.round((tasksDueTodayDone / tasksDueTodayTotal) * 100)
      : 0;
  const topHabit = [...habits].sort((a, b) => b.streak - a.streak)[0] || null;
  const user = db.users.find(u => u.id === auth.userId);
  send(res, 200, {
    summary: {
      totalHabits: habits.length, doneToday,
      completionRate: habits.length > 0 ? Math.round((doneToday / habits.length) * 100) : 0,
      totalTasks: tasks.length, tasksCompleted, todayScore,
      tasksDueToday: tasksDueTodayTotal,
      tasksDueTodayDone: tasksDueTodayDone,
      otherTasksTotal: tasks.filter(t => !t.dueDate || t.dueDate !== todayISO).length,
      otherTasksDone: tasks.filter(t => (!t.dueDate || t.dueDate !== todayISO) && t.done).length,
      currentStreak: user?.streak || 0,
      bestHabit: topHabit ? { name: topHabit.name, streak: topHabit.streak } : null
    },
    weeklyData, heatmap
  });
}

async function logSession(req, res) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const { duration, type } = await body(req);
  const db = readDB();
  const session = {
    id: crypto.randomUUID(), userId: auth.userId,
    duration: duration || 25, type: type || "pomodoro",
    completedAt: new Date().toISOString()
  };
  db.sessions.push(session);
  saveDB(db);
  send(res, 201, { session });
}

function getSessions(req, res) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const db = readDB();
  const sessions = db.sessions.filter(s => s.userId === auth.userId);
  const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  send(res, 200, { sessions: sessions.slice(-20), totalMinutes, totalSessions: sessions.length });
}

async function chat(req, res) {
  const auth = getUser(req);
  if (!auth) return send(res, 401, { error: "Unauthorized" });
  const { message } = await body(req);
  if (!message) return send(res, 400, { error: "Message required" });
  const db = readDB();
  const user = db.users.find(u => u.id === auth.userId);
  const habits = db.habits.filter(h => h.userId === auth.userId);
  const tasks = db.tasks.filter(t => t.userId === auth.userId);
  const sessions = db.sessions.filter(s => s.userId === auth.userId);
  const today = new Date().toDateString();
  const doneHabits = habits.filter(h => h.completions?.includes(today));
  const pendingHabits = habits.filter(h => !h.completions?.includes(today));
  const pendingTasks = tasks.filter(t => !t.done);
  const highPrioTasks = pendingTasks.filter(t => t.priority === "high");
  const medPrioTasks = pendingTasks.filter(t => t.priority === "medium");
  const lowPrioTasks = pendingTasks.filter(t => t.priority === "low");
  const overdueTasks = tasks.filter(t => !t.done && t.dueDate && new Date(t.dueDate) < new Date());
  const totalFocusMins = sessions.reduce((s, x) => s + x.duration, 0);
  const todaySessions = sessions.filter(s => new Date(s.completedAt).toDateString() === today);
  const topHabit = [...habits].sort((a, b) => b.streak - a.streak)[0];
  const streak = user?.streak || 0;
  const completionRate = habits.length > 0 ? Math.round((doneHabits.length / habits.length) * 100) : 0;
  const todayDateStr = new Date().toISOString().split('T')[0];
  const chatTasksDueToday = tasks.filter(t => t.dueDate && t.dueDate === todayDateStr);
  const chatTasksDueTodayDone = chatTasksDueToday.filter(t => t.done).length;
  const chatTasksDueTodayTotal = chatTasksDueToday.length;
  const score = habits.length > 0
    ? chatTasksDueTodayTotal > 0
      ? Math.round((doneHabits.length / habits.length) * 50 + (chatTasksDueTodayDone / chatTasksDueTodayTotal) * 50)
      : Math.round((doneHabits.length / habits.length) * 100)
    : chatTasksDueTodayTotal > 0
      ? Math.round((chatTasksDueTodayDone / chatTasksDueTodayTotal) * 100)
      : 0;
  const totalHabits = habits.length;
  const totalTasks = tasks.length;
  const name = user?.name?.split(" ")[0] || "there";
  const m = message.toLowerCase().trim();
  const L = arr => arr.length === 0 ? "none" : arr.map(x => `"${x}"`).join(", ");
  const B = s => `**${s}**`;
  let reply = "";

  if (m.includes("how am i doing")) {
    const grade = score >= 80 ? "Outstanding" : score >= 60 ? "Solid" : score >= 40 ? "Needs work" : "Behind today";
    const hLine = totalHabits === 0 ? "No habits set up yet." : doneHabits.length === totalHabits ? `All ${totalHabits} habits done today — perfect!` : `${doneHabits.length} of ${totalHabits} habits done (${completionRate}%). Still pending: ${L(pendingHabits.map(h => h.name))}.`;
    const tLine = tasks.length === 0 ? "No tasks added yet." : `${tasks.filter(t => t.done).length} of ${tasks.length} tasks done.${overdueTasks.length > 0 ? ` ${overdueTasks.length} overdue: ${L(overdueTasks.map(t => t.title))}.` : " No overdue tasks."}`;
    reply = `📊 Report for ${name}:\n\n${grade} — Score: ${B(score + "/100")}\n🔥 Streak: ${B(streak + " days")}\n\n${hLine}\n${tLine}\n\nFocus: ${todaySessions.length} session(s) today | ${totalFocusMins} total minutes.`;
  } else if (m.includes("what should i do now")) {
    if (overdueTasks.length > 0) reply = `Right now: handle ${B(overdueTasks[0].title)}. It's overdue and creating mental weight every hour it stays unfinished. Close all distractions and deal with it.`;
    else if (highPrioTasks.length > 0) reply = `Open ${B(highPrioTasks[0].title)} and work on it for 25 minutes straight. It's your highest priority task right now — don't let anything interrupt.`;
    else if (pendingHabits.length > 0) reply = `Complete ${B(pendingHabits[0].name)}. You have ${pendingHabits.length} habit(s) left today and a ${streak}-day streak to protect. Start with the easiest one.`;
    else if (pendingTasks.length > 0) reply = `All habits done — nice. Now focus on your pending tasks. Start with any medium priority one and work through the list.`;
    else reply = `You're in great shape right now, ${name}. All habits done, no urgent tasks. Use this time to plan tomorrow — write down your 3 most important goals for the next day.`;
  } else if (m.includes("give me my progress")) {
    const sm = streak < 7 ? `${streak}-day streak building. Keep going — 7 days is the first milestone.` : streak < 21 ? `${streak}-day streak! You're approaching the 21-day habit lock-in zone.` : `${streak}-day streak — that's elite consistency.`;
    const hList = habits.length === 0 ? "No habits added yet." : habits.map(h => `• ${B(h.name)} — ${h.streak}d streak (best: ${h.longestStreak}d)`).join("\n");
    reply = `📈 Progress for ${name}:\n\n${sm}\nCompletion today: ${completionRate}% | Score: ${score}/100\n\n${hList}\n\nTasks: ${tasks.filter(t => t.done).length} done, ${pendingTasks.length} pending${overdueTasks.length > 0 ? `, ${overdueTasks.length} overdue` : ""}.`;
  } else if (m.includes("check my habits")) {
    if (habits.length === 0) reply = `No habits added yet, ${name}. Head to the Habits page and add at least one to get started.`;
    else {
      const done = doneHabits.length > 0 ? `✅ Done (${doneHabits.length}): ${L(doneHabits.map(h => h.name))}.` : "❌ Nothing completed yet today.";
      const pend = pendingHabits.length > 0 ? `⏳ Pending (${pendingHabits.length}): ${L(pendingHabits.map(h => h.name))}.` : "🎉 All done today!";
      const next = pendingHabits.length > 0 ? `\nFocus on ${B(pendingHabits[0].name)} next to keep your ${streak}-day streak alive.` : "\nStreak is safe.";
      reply = `🔁 Habit check, ${name}:\n\n${done}\n${pend}${next}`;
    }
  } else if (m.includes("streak")) {
    if (streak === 0) reply = `Your streak is at zero right now. That changes the moment you complete one habit today. Just start — it takes 2 minutes.`;
    else if (streak < 7) reply = `You're on a ${B(streak + "-day streak")} 🔥. The first 7 days are the hardest. Push through and it starts feeling automatic.${pendingHabits.length > 0 ? ` Don't forget: ${L(pendingHabits.map(h => h.name))} still needs doing.` : " All habits done today — streak is safe!"}`;
    else if (streak < 21) reply = `${B(streak + " days strong")} 🔥. You're ${21 - streak} days away from the 21-day milestone where habits become identity. Protect this streak.`;
    else reply = `${B(streak + "-day streak")} 🏆. A streak this long means the habit is now part of who you are. You've built something most people never achieve.`;
  } else if (m.includes("my best habit")) {
    if (!topHabit) reply = `No habits added yet, ${name}. Add your first one and I'll track which you're strongest at.`;
    else {
      const others = habits.filter(h => h.name !== topHabit.name).sort((a, b) => b.streak - a.streak);
      reply = `🏆 Your strongest habit: ${B(topHabit.name)} with a ${topHabit.streak}-day streak (personal best: ${topHabit.longestStreak}d).${others.length > 0 ? `\nNext strongest: ${others.slice(0, 2).map(h => `${B(h.name)} (${h.streak}d)`).join(", ")}.` : ""}\n\nUse ${B(topHabit.name)} as an anchor — stack your weaker habits right after it.`;
    }
  } else if (m.includes("which habits did i miss")) {
    if (pendingHabits.length === 0) reply = `🎉 Nothing missed today, ${name}! All ${habits.length} habits completed. Your ${streak}-day streak is safe.`;
    else reply = `⏳ Still pending today (${pendingHabits.length}):\n\n${pendingHabits.map(h => `• ${B(h.name)}`).join("\n")}\n\n${streak > 7 ? `You have a ${streak}-day streak on the line — don't let it break.` : "Complete these to build your streak."}`;
  } else if (m.includes("my tasks status")) {
    if (tasks.length === 0) reply = `No tasks yet, ${name}. Add some on the Tasks page so I can help you prioritize.`;
    else {
      const ov = overdueTasks.length > 0 ? `\n⚠️ Overdue (${overdueTasks.length}): ${L(overdueTasks.map(t => t.title))}.` : "\n✅ No overdue tasks.";
      const hp = highPrioTasks.length > 0 ? `\n🔴 High: ${L(highPrioTasks.map(t => t.title))}.` : "\n🔴 No high priority pending.";
      const mp = medPrioTasks.length > 0 ? `\n🟡 Medium: ${L(medPrioTasks.map(t => t.title))}.` : "";
      const lp = lowPrioTasks.length > 0 ? `\n🟢 Low: ${L(lowPrioTasks.map(t => t.title))}.` : "";
      reply = `📋 Task status for ${name}:\n\n✅ Completed: ${tasks.filter(t => t.done).length} of ${tasks.length}.${ov}${hp}${mp}${lp}`;
    }
  } else if (m.includes("what are my high priority")) {
    if (highPrioTasks.length === 0) reply = `No high priority tasks right now, ${name}. ${medPrioTasks.length > 0 ? `Your most pressing items are medium priority: ${L(medPrioTasks.map(t => t.title))}.` : "Your task load looks manageable."}`;
    else reply = `🔴 High priority tasks:\n\n${highPrioTasks.map((t, i) => `${i + 1}. ${B(t.title)}`).join("\n")}\n\nDo ${B(highPrioTasks[0].title)} first. Single focus beats multitasking every time.`;
  } else if (m.includes("do i have overdue")) {
    if (overdueTasks.length === 0) {
      // No overdue — but still show all pending tasks sorted by priority
      if (pendingTasks.length === 0) {
        reply = `✅ No overdue tasks and no pending tasks, ${name}! You're completely on top of everything. Great job.`;
      } else {
        const pW = { high: 0, medium: 1, low: 2 };
        const sorted = pendingTasks.slice().sort((a, b) => {
          const da = a.dueDate ? (new Date(a.dueDate) - new Date()) / 86400000 : 999;
          const db2 = b.dueDate ? (new Date(b.dueDate) - new Date()) / 86400000 : 999;
          return (pW[a.priority]*10 + Math.min(da,10)) - (pW[b.priority]*10 + Math.min(db2,10));
        });
        const pIcon = { high: '🔴', medium: '🟡', low: '🟢' };
        const lines = sorted.map((t,i) => {
          const due = t.dueDate ? ` · Due: ${new Date(t.dueDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}${t.dueTime ? ' at ' + t.dueTime : ''}` : '';
          return `${i+1}. ${pIcon[t.priority]} ${B(t.title)}${due}`;
        }).join('\n');
        reply = `✅ No overdue tasks — you're on top of deadlines!\n\nHere are your ${pendingTasks.length} pending tasks sorted by priority:\n\n${lines}`;
      }
    } else {
      const pW = { high: 0, medium: 1, low: 2 };
      const allPending = pendingTasks.slice().sort((a, b) => {
        const da = a.dueDate ? (new Date(a.dueDate) - new Date()) / 86400000 : 999;
        const db2 = b.dueDate ? (new Date(b.dueDate) - new Date()) / 86400000 : 999;
        return (pW[a.priority]*10 + Math.min(da,10)) - (pW[b.priority]*10 + Math.min(db2,10));
      });
      const pIcon = { high: '🔴', medium: '🟡', low: '🟢' };
      const lines = allPending.map((t,i) => {
        const due = t.dueDate ? ` · Due: ${new Date(t.dueDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}${t.dueTime ? ' at ' + t.dueTime : ''}` : '';
        const isOver = t.dueDate && new Date(t.dueDate) < new Date();
        const tag = isOver ? ' ⚠️ OVERDUE' : '';
        return `${i+1}. ${pIcon[t.priority]} ${B(t.title)}${due}${tag}`;
      }).join('\n');
      reply = `⚠️ You have ${overdueTasks.length} overdue task(s) out of ${pendingTasks.length} pending:\n\n${lines}\n\nHandle the overdue ones first — ${B(overdueTasks[0].title)} is your most urgent right now.`;
    }
  } else if (m.includes("what task should i focus")) {
    if (overdueTasks.length > 0) reply = `No question: ${B(overdueTasks[0].title)}. It's overdue. Set a 25-minute timer and give it everything.`;
    else if (highPrioTasks.length > 0) reply = `Focus on ${B(highPrioTasks[0].title)}, ${name}. Block 25–50 minutes, kill distractions, and go deep. High-value work done with full focus beats a whole day of shallow work.`;
    else if (medPrioTasks.length > 0) reply = `No high priority tasks — good. Work on ${B(medPrioTasks[0].title)} next before it becomes urgent.`;
    else reply = `Your slate is clean, ${name}. Either clear a low priority task or use this time to plan the next few days while your head is clear.`;
  } else if (m.includes("motivate me")) {
    if (score >= 80) reply = `${name}, look at your numbers: ${B(score + "/100")}, ${B(streak + "-day streak")}, ${completionRate}% habits done. You don't need motivation — you need to recognize you're already doing it. Keep the standard high.`;
    else if (pendingHabits.length > 0 && streak > 0) reply = `You have a ${streak}-day streak and ${pendingHabits.length} habit(s) left — ${L(pendingHabits.map(h => h.name))}. That streak is ${streak} consecutive days of choosing discipline. Don't let one moment erase all of that. Do ${B(pendingHabits[0].name)} right now. Two minutes. Just start.`;
    else reply = `You've done ${doneHabits.length} habits today. That's not nothing — that's ${name} showing up when it counts. Motivation follows action. Pick one small thing and do it. The feeling will come after.`;
  } else if (m.includes("tired")) {
    reply = `Tiredness is real, ${name} — don't ignore it. ${doneHabits.length > 0 ? `You've already done ${doneHabits.length} habit(s) today — that's earned progress.` : "Even starting one habit today counts."} Try the 2-minute rule: begin ${B(pendingHabits.length > 0 ? pendingHabits[0].name : "one small task")} for just 2 minutes. Often the tiredness is resistance, not real fatigue. If you're genuinely exhausted though, sleep is the most productive thing you can do.`;
  } else if (m.includes("struggling")) {
    reply = `I hear you, ${name}. Struggling is part of the process — not a sign you're failing. Look at the facts: ${streak > 0 ? `${streak}-day streak` : "you showed up today"}${habits.length > 0 ? `, ${doneHabits.length} of ${habits.length} habits done` : ""}. That's not someone who's failing.\n\nWhen things are hard, shrink the target. Just pick ${B("one habit")} and ${B("one task")} for today. Small wins rebuild momentum faster than anything.`;
  } else if (m.includes("give me advice")) {
    if (overdueTasks.length > 0) reply = `Honest advice, ${name}: your biggest problem right now is ${overdueTasks.length} overdue task(s) — ${L(overdueTasks.map(t => t.title))}. These silently drain energy every day. Spend 30 minutes on ${B(overdueTasks[0].title)} before anything else today.`;
    else if (streak > 0 && pendingHabits.length > 0) reply = `You have a ${streak}-day streak worth protecting. Before anything else, finish ${B(pendingHabits[0].name)}. Streaks are momentum — and momentum is the most valuable asset in productivity. Everything else can wait 10 minutes.`;
    else if (completionRate < 60 && habits.length > 0) reply = `Honest take: ${completionRate}% completion means you're only doing ${doneHabits.length} of ${habits.length} habits consistently. The fix isn't more discipline — it's fewer habits. Cut to your top 3 and do those perfectly before adding more.`;
    else reply = `You're at ${score}/100 today. Consistency beats intensity every time. Don't aim for a perfect day — aim to be 1% better than yesterday. Your ${streak}-day streak proves you know how to show up.`;
  } else if (m.includes("focus session tips")) {
    reply = `🎯 Focus tips for ${name}:\n\nYou've done ${sessions.length} total sessions and ${totalFocusMins} minutes of focused work. ${todaySessions.length === 0 ? "No sessions yet today — good time to start." : `${todaySessions.length} session(s) done today.`}\n\n1. ${B("Start with your hardest task")}${highPrioTasks.length > 0 ? ` — that's ${highPrioTasks[0].title}` : ""}.\n2. ${B("25 minutes, one task, zero interruptions.")} No phone, no tabs.\n3. After each session, step away from the screen completely.\n4. 3–4 Pomodoros a day is a genuinely productive day.\n5. Track every session — the accountability compounds over time.`;
  } else if (m.includes("how much have i focused")) {
    const todayMins = todaySessions.length * 25;
    const grade = totalFocusMins >= 200 ? "Serious deep work." : totalFocusMins >= 100 ? "Good foundation." : totalFocusMins >= 50 ? "Decent start." : "Just getting going.";
    reply = `⏱ Focus stats for ${name}:\n\n🎯 Sessions today: ${B(String(todaySessions.length))}\n⏱ Today's minutes: ~${B(String(todayMins))}\n📊 All-time: ${B(totalFocusMins + " minutes")} across ${sessions.length} sessions\n\n${grade}\n${todaySessions.length === 0 ? "Start a session now — even one Pomodoro improves your score today." : "Keep going — each session builds the deep work habit."}`;
  } else {
    reply = `Here's your snapshot, ${name}: Score ${B(score + "/100")}, streak ${B(streak + " days")}, ${doneHabits.length}/${habits.length} habits done, ${tasks.filter(t => t.done).length}/${tasks.length} tasks complete.${overdueTasks.length > 0 ? ` ⚠️ ${overdueTasks.length} overdue task(s) need attention.` : " No overdue tasks."} Use the buttons above to ask me something specific.`;
  }

  send(res, 200, { reply });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  const method = req.method;

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
    });
    return res.end();
  }

  if (!url.startsWith("/api")) {
    const base = path.join(__dirname, "frontend");
    const file = url === "/" ? "/index.html" : url;
    const ext = path.extname(file);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };
    return serveStatic(res, path.join(base, file), types[ext] || "text/plain");
  }

  try {
    if (url === "/api/auth/register" && method === "POST") return register(req, res);
    if (url === "/api/auth/login"    && method === "POST") return login(req, res);
    if (url === "/api/auth/me"       && method === "GET")  return me(req, res);
    if (url === "/api/habits"        && method === "GET")  return getHabits(req, res);
    if (url === "/api/habits"        && method === "POST") return createHabit(req, res);
    if (url === "/api/tasks"         && method === "GET")  return getTasks(req, res);
    if (url === "/api/tasks"         && method === "POST") return createTask(req, res);
    if (url === "/api/analytics"     && method === "GET")  return getAnalytics(req, res);
    if (url === "/api/sessions"      && method === "GET")  return getSessions(req, res);
    if (url === "/api/sessions"      && method === "POST") return logSession(req, res);
    if (url === "/api/chat"          && method === "POST") return chat(req, res);

    const hc = url.match(/^\/api\/habits\/([^/]+)\/complete$/);
    if (hc && method === "PUT") return toggleHabit(req, res, hc[1]);

    const hd = url.match(/^\/api\/habits\/([^/]+)$/);
    if (hd && method === "DELETE") return deleteHabit(req, res, hd[1]);

    const tm = url.match(/^\/api\/tasks\/([^/]+)$/);
    if (tm && method === "PUT")    return updateTask(req, res, tm[1]);
    if (tm && method === "DELETE") return deleteTask(req, res, tm[1]);

    send(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Brot running at http://localhost:${PORT}`);
});