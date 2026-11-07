import { toast, openModal, openStudentProfile } from "../app.js";
import { apiFetch } from "../api.js";

// ======================================
// HELPER FUNCTIONS
// ======================================

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function getInitials(name = "") {
  return String(name).trim().split(/\s+/).map(word => word[0] || "").join("").slice(0, 2).toUpperCase() || "CP";
}

function renderAvatar(user, size = 48, clickable = false) {
  const name = escapeHTML(user.name || "CampusPool User");
  const userId = Number(user.id || user.contact_user_id);

  let avatarHTML = user.profile_picture
    ? `<img src="${escapeHTML(user.profile_picture)}" alt="${name}" style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; flex-shrink:0;">`
    : `<div class="avatar" style="width:${size}px; height:${size}px; min-width:${size}px; display:flex; align-items:center; justify-content:center; border-radius:50%;">${getInitials(user.name)}</div>`;

  if (clickable && userId > 0) {
    return `<div data-open-student-profile="${userId}" style="cursor:pointer;flex-shrink:0;">${avatarHTML}</div>`;
  }
  return avatarHTML;
}

function profileLink(user, content) {
  const userId = Number(user.id || user.contact_user_id);
  if (!userId) return content;
  return `<div data-open-student-profile="${userId}" style="cursor:pointer;">${content}</div>`;
}

// ======================================
// RENDER TRUSTED CONTACTS
// ======================================

function renderContactList(contacts) {
  const container = document.querySelector("#emergency-contact-list");
  if (!container) return;

  if (!contacts.length) {
    container.innerHTML = `<p class="field-hint">No Trusted Contacts added yet. Click "Add contact" to connect someone.</p>`;
    return;
  }

  container.innerHTML = contacts.map(contact => `
    <div class="contact-row">
      ${renderAvatar(contact, 44, true)}
      <div style="flex:1;min-width:0;">
        ${profileLink(contact, `
          <strong>${escapeHTML(contact.name)}</strong>
          <small style="display:block;">${escapeHTML(contact.department)}</small>
        `)}
      </div>
      <button class="btn btn-secondary btn-small" data-delete-contact="${Number(contact.id)}" type="button">Remove</button>
    </div>
    <div class="divider"></div>
  `).join("");
}

async function loadContacts() {
  const container = document.querySelector("#emergency-contact-list");
  if (!container) return;
  try {
    const result = await apiFetch("/trusted-contacts");
    renderContactList(result.contacts || []);
  } catch (error) {
    container.innerHTML = `<p class="field-hint">Could not load contacts.</p>`;
  }
}

function showAddContactForm() {
  openModal(`
    <h2 style="font-family:Space Grotesk">Add Trusted Contact</h2>
    <form id="trusted-contact-search-form" class="form-grid">
      <div class="field field-full">
        <label>Student ID</label>
        <input type="text" name="user_id" placeholder="Enter Student ID" required>
      </div>
      <div class="field field-full">
        <button class="btn btn-primary" type="submit">Search Account</button>
      </div>
    </form>
    <div id="trusted-contact-search-result"></div>
  `);
}

// ======================================
// MAIN SAFETY PAGE
// ======================================

export function renderSafety() {
  setTimeout(loadContacts, 0);

  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow">SAFETY IS PART OF THE JOURNEY</div>
        <h1>Safety centre</h1>
        <p>Quick access to trip-sharing, trusted contacts and emergency guidance.</p>
      </div>
      <span class="pill red">LIVE EMERGENCY TOOL</span>
    </div>

    <div class="grid grid-2">
      <section class="sos-panel" style="border: 2px solid #ef4444; box-shadow: 0 0 20px rgba(239, 68, 68, 0.2);">
        <span class="pill red" style="background:#ef4444; color:white;">🚨 REAL-TIME SOS</span>
        <h2 style="font:600 22px Space Grotesk;margin:18px 0 0">Need urgent help?</h2>
        
        <p style="color:#ef4444; font-weight:bold; margin-bottom:20px;">
          Hold for 3 seconds to send your live location to your Trusted Contacts!
        </p>

        <button class="sos-button" id="sos-button" style="background: radial-gradient(circle, #ff4d4d 0%, #cc0000 100%); border: 4px solid #ffcccc;">
          SOS<br><small>HOLD 3 SEC</small>
        </button>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Trusted contacts</h2>
            <p>They will receive your emergency alert</p>
          </div>
          <button class="btn btn-secondary btn-small" id="add-contact" type="button">＋ Add contact</button>
        </div>
        <div class="panel-body" id="emergency-contact-list"></div>
      </section>
    </div>
  `;
}

// ======================================
// REAL SOS LOGIC (3 Second Hold)
// ======================================

let sosHoldTimer = null;

async function sendRealSOS() {
  toast("Fetching your live location...");

  if (!navigator.geolocation) {
    toast("Geolocation is not supported by your browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(async (position) => {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    try {
      const response = await apiFetch("/sos/trigger", {
        method: "POST",
        body: JSON.stringify({
          latitude: lat,
          longitude: lon,
          message: "EMERGENCY! I need help immediately. This is an automated SOS alert."
        })
      });

      // সাকসেস হলে বড় রেড অ্যালার্ট মোডাল দেখাবে
      openModal(`
        <div style="text-align:center; padding: 20px;">
          <h1 style="font-size:60px; margin:0;">🚨</h1>
          <h2 style="color:#ef4444; font-family:Space Grotesk; margin-top:10px;">SOS ALERT SENT!</h2>
          <p style="font-size:16px;">Your live location has been sent to all your Trusted Contacts and Admins.</p>
          <div style="background:rgba(239,68,68,0.1); padding:15px; border-radius:10px; margin:20px 0;">
            <strong>Latitude:</strong> ${lat.toFixed(6)}<br>
            <strong>Longitude:</strong> ${lon.toFixed(6)}
          </div>
          <button class="btn btn-primary" data-close-modal style="width:100%">I Understand</button>
        </div>
      `);

    } catch (error) {
      toast("Failed to send SOS: " + error.message);
    }
  }, (error) => {
    toast("Location access denied. Cannot send Live SOS.");
  });
}

// Hold Events
document.addEventListener("mousedown", e => {
  if (e.target.closest("#sos-button")) {
    toast("Keep holding for 3 seconds...");
    sosHoldTimer = setTimeout(async () => {
      await sendRealSOS();
      sosHoldTimer = null;
    }, 3000);
  }
});

document.addEventListener("mouseup", () => {
  if (sosHoldTimer) {
    clearTimeout(sosHoldTimer);
    sosHoldTimer = null;
  }
});

document.addEventListener("mouseleave", () => {
  if (sosHoldTimer) {
    clearTimeout(sosHoldTimer);
    sosHoldTimer = null;
  }
});

// ======================================
// OTHER CLICK EVENTS
// ======================================

document.addEventListener("click", async e => {
  if (e.target.closest("[data-open-student-profile]")) {
    const userId = Number(e.target.closest("[data-open-student-profile]").dataset.openStudentProfile);
    if (userId > 0) openStudentProfile(userId);
    return;
  }

  if (e.target.closest("#add-contact")) {
    showAddContactForm();
    return;
  }

  const deleteButton = e.target.closest("[data-delete-contact]");
  if (deleteButton) {
    const contactId = deleteButton.dataset.deleteContact;
    if (!confirm("Remove this Trusted Contact?")) return;

    try {
      await apiFetch(`/trusted-contacts/${contactId}`, { method: "DELETE" });
      toast("Trusted Contact removed.");
      await loadContacts();
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  const addButton = e.target.closest("#confirm-trusted-contact");
  if (addButton) {
    const userId = Number(addButton.dataset.userId);
    if (!userId) return;

    addButton.disabled = true;
    addButton.textContent = "Adding...";

    try {
      await apiFetch("/trusted-contacts", {
        method: "POST",
        body: JSON.stringify({ user_id: userId })
      });
      document.querySelector("#modal")?.close();
      toast("Trusted Contact added successfully.");
      await loadContacts();
    } catch (error) {
      toast(error.message);
      addButton.disabled = false;
      addButton.textContent = "Add Trusted Contact";
    }
  }
});

// ======================================
// FORM SUBMISSION (Search Account)
// ======================================

document.addEventListener("submit", async e => {
  if (e.target.id === "trusted-contact-search-form") {
    e.preventDefault();
    const studentId = e.target.querySelector('[name="user_id"]').value.trim();
    const button = e.target.querySelector('button[type="submit"]');
    const resultContainer = document.querySelector("#trusted-contact-search-result");

    button.disabled = true;
    button.textContent = "Searching...";
    resultContainer.innerHTML = "";

    try {
      const result = await apiFetch(`/trusted-contacts/search/${encodeURIComponent(studentId)}`);
      const user = result.user;

      if (!user || !user.id) throw new Error("No account found.");

      resultContainer.innerHTML = `
        <div class="panel" style="padding:18px;margin-top:18px;">
          <div style="display:flex; align-items:center; gap:14px;">
            ${renderAvatar(user, 64, true)}
            <div>
              <h3 style="margin:0;">${escapeHTML(user.name)}</h3>
              <p class="field-hint">${escapeHTML(user.department)}</p>
            </div>
          </div>
          <button class="btn btn-primary" type="button" id="confirm-trusted-contact" data-user-id="${Number(user.id)}" style="width:100%;margin-top:18px;">
            Add Trusted Contact
          </button>
        </div>
      `;
    } catch (error) {
      resultContainer.innerHTML = `<p style="color:red;">${escapeHTML(error.message)}</p>`;
    } finally {
      button.disabled = false;
      button.textContent = "Search Account";
    }
  }
});