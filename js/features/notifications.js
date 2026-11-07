import { state } from "../state.js";
import { toast } from "../app.js";
import { apiFetch } from "../api.js";

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value.replace(" ", "T") + "Z");

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function mapNotification(n) {
  return {
    id: n.id,
    title: n.title,
    text: n.message,
    time: formatTime(n.created_at),
    kind: n.type?.includes("safety") || n.type?.includes("sos")
      ? "safety"
      : n.type?.includes("ride")
        ? "ride"
        : n.type?.includes("message")
          ? "message"
          : "system",
    unread: Number(n.is_read) === 0,
    latitude: n.sos_latitude,   // <-- লোকেশন যুক্ত করা হলো
    longitude: n.sos_longitude  // <-- লোকেশন যুক্ত করা হলো
  };
}

export function renderNotifications() {
  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow">STAY IN THE LOOP</div>
        <h1>Notifications</h1>
        <p>Ride requests, messages, reminders and safety updates.</p>
      </div>

      <button class="btn btn-secondary" id="mark-all-read">
        ✓ Mark all read
      </button>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>Recent activity</h2>
          <p>${state.notifications.filter(n => n.unread).length} unread notifications</p>
        </div>
        <span class="pill">INBOX</span>
      </div>

      <div class="panel-body notification-list">
        ${
          state.notifications.length
            ? state.notifications.map(n => `
                <article class="notification-row ${n.unread ? "is-unread" : ""}" 
                  style="${n.kind === 'safety' ? 'border-left: 4px solid #ef4444; background: rgba(239, 68, 68, 0.08);' : ''}">
                  
                  <span class="notice-icon" style="${n.kind === 'safety' ? 'color: #ef4444; font-size: 20px;' : ''}">
                    ${
                      n.kind === "safety" ? "🚨" :
                      n.kind === "ride" ? "↗" :
                      n.kind === "message" ? "◌" : "✦"
                    }
                  </span>

                  <div style="flex: 1;">
                    <strong style="${n.kind === 'safety' ? 'color: #ef4444; font-weight: bold;' : ''}">
                      ${escapeHTML(n.title)}
                    </strong>
                    <p>${escapeHTML(n.text)}</p>
                    <small>${escapeHTML(n.time)}</small>

                    <!-- লাইভ লোকেশন বাটন -->
                    ${n.kind === 'safety' && n.latitude && n.longitude ? `
                      <div style="margin-top: 10px;">
                        <a href="https://www.google.com/maps?q=${n.latitude},${n.longitude}" 
                           target="_blank" 
                           style="display: inline-block; background: #ef4444; color: white; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 13px; transition: 0.2s;">
                          📍 View Live Location
                        </a>
                      </div>
                    ` : ''}
                  </div>

                  ${
                    n.unread
                      ? `<button class="btn btn-secondary btn-small" data-read="${n.id}">Mark read</button>`
                      : '<span class="pill">Read</span>'
                  }
                </article>
              `).join("")
            : `<p class="field-hint">No notifications yet.</p>`
        }
      </div>
    </div>
  `;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}


// Load notifications from backend
export async function loadNotifications() {
  try {
    const data = await apiFetch("/notifications");

    state.notifications = (data.notifications || []).map(mapNotification);

    updateNotificationBadges(); // <-- ব্যাজ আপডেট করার ফাংশন কল করা হলো

    if (state.currentView === "notifications") {
      document.querySelector("#view-root").innerHTML = renderNotifications();
    }

  } catch (error) {
    console.error("Notification Loading Error:", error);
    toast(error.message || "Could not load notifications.");
  }
}

// ==========================================
// নোটিফিকেশন ব্যাজ আপডেট
// ==========================================
function updateNotificationBadges() {
  const unreadCount = state.notifications.filter(n => n.unread).length;
  
  // হেডারের লাল ডট
  const headerBadge = document.querySelector("#header-notification-badge");
  if (headerBadge) {
    headerBadge.style.display = unreadCount > 0 ? "block" : "none";
  }

  // সাইডবারের কাউন্ট
  const sidebarBadge = document.querySelector("#sidebar-notification-count");
  if (sidebarBadge) {
    sidebarBadge.textContent = unreadCount > 99 ? "99+" : unreadCount;
    sidebarBadge.hidden = unreadCount <= 0;
  }
}

// ==========================================
// রিয়েল-টাইম পোলিং (প্রতি ৫ সেকেন্ডে চেক)
// ==========================================
let pollingTimer = null;

export function startNotificationPolling() {
  if (pollingTimer) clearInterval(pollingTimer);

  pollingTimer = setInterval(async () => {
    // যদি লগইন করা না থাকে, তবে চেক করার দরকার নেই
    if (!state.authenticated) return;

    try {
      const data = await apiFetch("/notifications");
      const newNotifications = (data.notifications || []).map(mapNotification);
      
      // আগের এবং নতুন নোটিফিকেশনের সংখ্যা মিলিয়ে দেখো
      const oldUnread = state.notifications.filter(n => n.unread).length;
      const newUnread = newNotifications.filter(n => n.unread).length;

      // স্টেট আপডেট করো
      state.notifications = newNotifications;
      
      // ব্যাজ আপডেট করো
      updateNotificationBadges();

      // যদি নতুন নোটিফিকেশন আসে এবং ইউজার নোটিফিকেশন পেজে থাকে, তবে পেজ রিফ্রেশ করো
      if (state.currentView === "notifications") {
        document.querySelector("#view-root").innerHTML = renderNotifications();
      }

      // নতুন নোটিফিকেশন এলে ব্রাউজারে টোস্ট দেখাবে
      if (newUnread > oldUnread) {
        // চেক করো এটা সেফটি অ্যালার্ট কিনা
        const hasNewSafetyAlert = newNotifications.some(n => n.unread && n.kind === "safety");
        
        if (hasNewSafetyAlert) {
          toast("🚨 EMERGENCY SOS ALERT RECEIVED!");
        } else {
          toast("You have a new notification!");
        }
      }

    } catch (error) {
      // ব্যাকগ্রাউন্ড পোলিং-এ এরর হলে চুপচাপ থাকবে, কনসোললগ করবে
      console.error("Polling error:", error);
    }
  }, 5000); // ৫ সেকেন্ড পর পর চেক করবে
}


// Notification buttons
document.addEventListener("click", async e => {

  // Mark all as read
  if (e.target.closest("#mark-all-read")) {
    try {
      await apiFetch("/notifications/read-all", {
        method: "PATCH"
      });

      state.notifications.forEach(n => n.unread = false);
      
      updateNotificationBadges(); // রিড করার পর ব্যাজ আপডেট

      if (state.currentView === "notifications") {
        document.querySelector("#view-root").innerHTML = renderNotifications();
      }

      toast("All notifications marked read.");

    } catch (error) {
      toast(error.message);
    }

    return;
  }

  // Mark one as read
  const button = e.target.closest("[data-read]");

  if (button) {
    try {
      const id = button.dataset.read;

      await apiFetch(`/notifications/${id}/read`, {
        method: "PATCH"
      });

      const notification = state.notifications.find(n => String(n.id) === String(id));

      if (notification) {
        notification.unread = false;
      }

      updateNotificationBadges(); // রিড করার পর ব্যাজ আপডেট

      if (state.currentView === "notifications") {
        document.querySelector("#view-root").innerHTML = renderNotifications();
      }

    } catch (error) {
      toast(error.message);
    }
  }
});