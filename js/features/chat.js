import { apiFetch } from "../api.js";
import { toast, openStudentProfile } from "../app.js";

let selectedBookingId = null;
let conversations = [];
let chatRefreshTimer = null;
let isRefreshing = false;

let notificationInitialized = false;
let previousUnreadCounts = new Map();

// টাইপিং ইন্ডিকেটরের জন্য ভেরিয়েবল
let typingTimer = null;

// ======================================
// SAFE TEXT
// ======================================

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// ======================================
// CLICKABLE URL
// ======================================

function formatMessage(message) {
  const escaped = esc(message);
  const formattedText = escaped.replace(/\r\n|\r|\n/g, "<br>");
  return formattedText.replace(
    /https?:\/\/[^\s<>"']+/gi,
    url => {
      const match = url.match(/^(.*?)([.,!?;:]*)$/);
      const cleanUrl = match[1];
      const punctuation = match[2];
      try {
        const parsed = new URL(cleanUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
      } catch {
        return url;
      }
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;word-break:break-all;cursor:pointer;">${cleanUrl}</a>${punctuation}`;
    }
  );
}

// ======================================
// INITIALS
// ======================================

function initials(name) {
  return String(name || "Student")
    .trim()
    .split(/\s+/)
    .map(x => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ======================================
// TIME
// ======================================

function formatTime(value) {
  if (!value) return "";
  const normalized = String(value).includes("T")
    ? String(value)
    : String(value).replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-BD", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ======================================
// RENDER CHAT PAGE
// ======================================

export function renderChat() {
  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow">PRIVATE MESSAGES</div>
        <h1>Messages</h1>
        <p>Stay connected with your ride partners.</p>
      </div>

      <button class="btn btn-secondary btn-small" id="enable-chat-notifications">
        Enable notifications
      </button>
    </div>

    <section class="panel chat-layout">

      <aside class="chat-list">
        <div class="chat-list-head">
          <strong>Messages</strong>
          <button type="button" class="btn btn-secondary btn-small" id="refresh-inbox">↻</button>
        </div>
        <div id="conversation-list">
          <p class="field-hint">Loading conversations...</p>
        </div>
      </aside>

      <section class="chat-window">

        <div id="chat-header" class="chat-header">
          <div>
            <strong>Select a conversation</strong>
            <small>Your private ride chat</small>
          </div>
        </div>

        <div id="chat-status" class="field-hint" style="padding:12px">
          Choose a conversation to start chatting.
        </div>

        <div id="chat-messages" class="chat-messages"></div>

        <form id="chat-form" class="chat-compose">
          <input type="text" name="message" required maxlength="500" placeholder="Type your message..." autocomplete="off">
          <button class="btn btn-primary" type="submit">Send</button>
        </form>

        <p class="chat-disclaimer">
          Only confirmed ride participants can access this conversation.
        </p>

      </section>
    </section>
  `;
}

// ======================================
// NOTIFICATIONS & CONVERSATION LIST
// ======================================

function checkNewNotifications(data) {
  const items = data.conversations || [];
  const currentCounts = new Map();
  items.forEach(item => {
    const bookingId = Number(item.booking_id);
    const unread = Number(item.unread_count || 0);
    currentCounts.set(bookingId, unread);
    if (!notificationInitialized) return;
    const previous = previousUnreadCounts.get(bookingId) || 0;
    if (unread <= previous) return;
    if (bookingId === Number(selectedBookingId)) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const notification = new Notification(`New message from ${item.other_user_name || "Student"}`, {
      body: item.last_message || "You have received a new message.",
      tag: `campuspool-chat-${bookingId}`,
      icon: "./favicon.ico"
    });

    notification.onclick = async () => {
      window.focus();
      if (document.querySelector("#chat-form")) await openConversation(bookingId);
      else toast("Open Messages to view this conversation.");
      notification.close();
    };
  });
  previousUnreadCounts = currentCounts;
  notificationInitialized = true;
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    toast("This browser does not support notifications.");
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    toast(permission === "granted" ? "Browser notifications enabled." : "Notification permission was not granted.");
  } catch (error) {
    toast("Could not enable notifications.");
  }
}

function renderConversation(item) {
  const active = Number(item.booking_id) === Number(selectedBookingId);
  const unread = Number(item.unread_count || 0);
  return `
    <div class="chat-person ${active ? "active" : ""}">
      <button type="button" class="chat-person-main" data-chat-booking="${Number(item.booking_id)}">
        <div class="avatar avatar-blue">${esc(initials(item.other_user_name))}</div>
        <span>
          <strong>${esc(item.other_user_name)}</strong>
          <small>${esc(item.last_message || "Start a conversation")}</small>
        </span>
        ${unread ? `<b class="message-count">${unread}</b>` : ""}
      </button>
      <button type="button" class="chat-profile-button" data-profile-user="${Number(item.other_user_id)}" title="View student profile">Profile</button>
    </div>
  `;
}

function updateUnreadBadge(count) {
  const badge = document.querySelector("#message-count");
  if (!badge) return;
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.hidden = count <= 0;
}

async function loadInbox() {
  const list = document.querySelector("#conversation-list");
  if (!list) return;
  try {
    const data = await apiFetch("/messages");
    conversations = data.conversations || [];
    checkNewNotifications(data);
    list.innerHTML = conversations.length
      ? conversations.map(renderConversation).join("")
      : `<p class="field-hint">No confirmed ride conversations yet.</p>`;
    updateUnreadBadge(data.unread_total || 0);

    if (selectedBookingId && !conversations.some(item => Number(item.booking_id) === Number(selectedBookingId))) {
      selectedBookingId = null;
      setComposerEnabled(false);
    }
  } catch (error) {
    list.innerHTML = `<p class="field-hint">${esc(error.message)}</p>`;
  }
}

function setComposerEnabled(enabled) {
  const input = document.querySelector('#chat-form input[name="message"]');
  const button = document.querySelector('#chat-form button[type="submit"]');
  if (input) input.disabled = !enabled;
  if (button) button.disabled = !enabled;
}

async function openConversation(bookingId) {
  const id = Number(bookingId);
  const item = conversations.find(c => Number(c.booking_id) === id);
  if (!item) {
    toast("Conversation not found. Please refresh Messages.");
    return;
  }

  selectedBookingId = id;
  const header = document.querySelector("#chat-header");
  if (header) {
    header.innerHTML = `
      <button type="button" class="chat-header-profile" data-profile-user="${Number(item.other_user_id)}" title="View student profile">
        <div class="avatar avatar-purple">${esc(initials(item.other_user_name))}</div>
        <div class="chat-header-user-info">
          <strong>${esc(item.other_user_name)}</strong>
          <small>${esc(item.other_department || "Student")} · ${esc(item.other_student_id || "")}</small>
        </div>
      </button>
    `;
  }

  document.querySelectorAll("[data-chat-booking]").forEach(button => {
    button.closest(".chat-person")?.classList.toggle("active", Number(button.dataset.chatBooking) === id);
  });

  setComposerEnabled(true);
  await loadChatMessages();
  await loadInbox();
  
  if (selectedBookingId === id) {
    setComposerEnabled(true);
    document.querySelector('#chat-form input[name="message"]')?.focus();
  }
}

// ======================================
// LOAD MESSAGES (Seen Status Added)
// ======================================

async function loadChatMessages() {
  const box = document.querySelector("#chat-messages");
  const status = document.querySelector("#chat-status");
  if (!box || !status || !selectedBookingId) return;

  try {
    const data = await apiFetch(`/bookings/${selectedBookingId}/messages`);
    const messages = data.messages || [];

    box.innerHTML = messages.map(item => {
      const mine = Number(item.is_mine) === 1;
      
      // Seen (দেখেছে) স্ট্যাটাস চেক করা
      let seenStatus = "";
      if (mine) {
        seenStatus = item.read_at 
          ? `<span style="color: #25d366; font-size: 11px; margin-left: 5px;">✓✓ Seen</span>` 
          : `<span style="color: gray; font-size: 11px; margin-left: 5px;">✓ Sent</span>`;
      }

      return `
        <div class="message ${mine ? "mine" : "other"}">
          <div class="message-bubble">
            ${formatMessage(item.message)}
          </div>
          <small class="message-time">
            ${esc(formatTime(item.created_at))}
            ${seenStatus}
          </small>
        </div>
      `;
    }).join("");

    status.textContent = messages.length ? "" : "No messages yet. Send the first message.";
    box.scrollTop = box.scrollHeight;

  } catch (error) {
    status.textContent = error.message;
  }
}

// ======================================
// TYPING INDICATOR (লিখছে...)
// ======================================

document.addEventListener("input", e => {
  if (e.target.matches('#chat-form input[name="message"]')) {
    const status = document.querySelector("#chat-status");
    if (!status || !selectedBookingId) return;

    status.textContent = "Typing...";
    status.style.color = "#25d366"; // সবুজ রঙ
    status.style.fontStyle = "italic";

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      status.textContent = ""; 
    }, 2000);
  }
});

// ======================================
// AUTO REFRESH
// ======================================

async function refreshChat() {
  if (isRefreshing) return;
  if (!document.querySelector("#chat-form")) {
    stopAutoRefresh();
    return;
  }
  isRefreshing = true;
  try {
    await loadInbox();
    if (selectedBookingId) {
      await loadChatMessages();
    }
  } finally {
    isRefreshing = false;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  chatRefreshTimer = setInterval(() => refreshChat(), 3000);
}

function stopAutoRefresh() {
  if (chatRefreshTimer) {
    clearInterval(chatRefreshTimer);
    chatRefreshTimer = null;
  }
}

// ======================================
// PAGE LOAD
// ======================================

export async function loadChat() {
  await refreshChat();
  startAutoRefresh();
}

export function bindChat() {}

// ======================================
// CLICK EVENTS
// ======================================

document.addEventListener("click", async event => {
  const profileButton = event.target.closest("[data-profile-user]");
  if (profileButton) {
    event.preventDefault();
    event.stopPropagation();
    const userId = Number(profileButton.dataset.profileUser);
    if (userId > 0) openStudentProfile(userId);
    return;
  }

  const conversation = event.target.closest("[data-chat-booking]");
  if (conversation) {
    event.preventDefault();
    await openConversation(conversation.dataset.chatBooking);
    return;
  }

  if (event.target.closest("#refresh-inbox")) {
    await refreshChat();
    return;
  }

  if (event.target.closest("#enable-chat-notifications")) {
    await enableNotifications();
    return;
  }
});

// ======================================
// SEND MESSAGE
// ======================================

document.addEventListener("submit", async event => {
  if (event.target.id !== "chat-form") return;
  event.preventDefault();

  const form = event.target;
  const input = form.querySelector('input[name="message"]');
  const button = form.querySelector('button[type="submit"]');
  const message = input.value.trim();

  if (!selectedBookingId) {
    toast("Please select a conversation first.");
    return;
  }

  if (!message) {
    input.focus();
    return;
  }

  try {
    button.disabled = true;
    await apiFetch(`/bookings/${selectedBookingId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message })
    });
    input.value = "";
    await loadChatMessages();
    await loadInbox();
  } catch (error) {
    toast(error.message);
  } finally {
    if (selectedBookingId) {
      setComposerEnabled(true);
    }
    input.focus();
  }
});