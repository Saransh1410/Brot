const API = window.location.origin + "/api";

const Auth = {
  getToken: () => localStorage.getItem("brot_token"),
  setToken: t => localStorage.setItem("brot_token", t),
  getUser: () => JSON.parse(localStorage.getItem("brot_user") || "null"),
  setUser: u => localStorage.setItem("brot_user", JSON.stringify(u)),
  clear: () => { localStorage.removeItem("brot_token"); localStorage.removeItem("brot_user"); },
  isLoggedIn: () => !!localStorage.getItem("brot_token")
};

async function req(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = Auth.getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(API + path, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

const AuthAPI = {
  async register(name, email, password) {
    const data = await req("/auth/register", { method: "POST", body: { name, email, password } });
    Auth.setToken(data.token);
    Auth.setUser(data.user);
    return data;
  },
  async login(email, password) {
    const data = await req("/auth/login", { method: "POST", body: { email, password } });
    Auth.setToken(data.token);
    Auth.setUser(data.user);
    return data;
  },
  me: () => req("/auth/me"),
  logout() { Auth.clear(); location.reload(); }
};

const HabitsAPI = {
  getAll: () => req("/habits"),
  create: data => req("/habits", { method: "POST", body: data }),
  complete: id => req(`/habits/${id}/complete`, { method: "PUT" }),
  delete: id => req(`/habits/${id}`, { method: "DELETE" })
};

const TasksAPI = {
  getAll: () => req("/tasks"),
  create: data => req("/tasks", { method: "POST", body: data }),
  update: (id, data) => req(`/tasks/${id}`, { method: "PUT", body: data }),
  delete: id => req(`/tasks/${id}`, { method: "DELETE" }),
  toggle: (id, done) => req(`/tasks/${id}`, { method: "PUT", body: { done } })
};

const AnalyticsAPI = {
  get: () => req("/analytics")
};

const SessionsAPI = {
  getAll: () => req("/sessions"),
  log: (duration, type) => req("/sessions", { method: "POST", body: { duration, type } })
};