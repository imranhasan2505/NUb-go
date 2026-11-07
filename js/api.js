// Render-এ তোমার ব্যাকএন্ডের লিংক
const API_BASE = "https://nub-go.onrender.com/api";

export function getToken() {
  return localStorage.getItem("campuspool_token") || "";
}

export function setSession(token, user) {
  localStorage.setItem("campuspool_token", token);
  localStorage.setItem("campuspool_authenticated", "true");

  localStorage.setItem("campuspool_name", user.name || "");

  localStorage.setItem(
    "campuspool_student_id",
    user.student_id || user.studentId || ""
  );

  localStorage.setItem(
    "campuspool_department",
    user.department || ""
  );

  localStorage.setItem(
    "campuspool_user_id",
    String(user.id || "")
  );

  // Save user role for page refresh
  localStorage.setItem(
    "campuspool_role",
    user.role || "student"
  );

  localStorage.setItem(
    "campuspool_account_status",
    user.account_status || "active"
  );
}

export function clearSession() {
  [
    "campuspool_token",
    "campuspool_authenticated",
    "campuspool_name",
    "campuspool_student_id",
    "campuspool_department",
    "campuspool_user_id",
    "campuspool_role",
    "campuspool_account_status"
  ].forEach(key => localStorage.removeItem(key));
}

export async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || `Request failed (${response.status})`
    );
  }

  return data;
}
