import { state } from "../state.js";
import { toast } from "../app.js";
import { apiFetch } from "../api.js";

const STORAGE_PREFIX = "campuspool_profile_";
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

const required = [
  ["photo", "Profile photo", 15],
  ["studentCard", "Student ID card", 35],
  ["phone1", "Primary phone number", 15],
  ["phone2", "Alternative phone number", 15],
  ["department", "Department", 20]
];

/* =====================================
   HELPERS
===================================== */

function esc(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function getStorageId(user) {
  return String(
    user.id ||
    user.user_id ||
    user.email ||
    user.studentId ||
    user.student_id ||
    "default"
  ).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getCoverStorageKey(user) {
  return STORAGE_PREFIX + getStorageId(user) + "_cover";
}

function getPhoto(user) {
  return user.photo || user.profile_picture || "";
}

function getCard(user) {
  return user.studentCard || user.student_card || "";
}

function normalizeUser(data) {
  const u = data.user || data;

  return {
    ...state.currentUser,
    ...u,
    id: u.id || u.user_id || state.currentUser?.id,
    studentId: u.student_id || u.studentId || "",
    studentCard: u.student_card || u.studentCard || "",
    photo: u.profile_picture || u.photo || "",
    profile_picture: u.profile_picture || u.photo || "",
    phone1: u.phone1 || "",
    phone2: u.phone2 || "",
    department: u.department || "",
    verification_score:
      u.verification_score ?? u.verificationScore,
    can_book: u.can_book ?? u.canBook,
    is_verified: u.is_verified
  };
}

/* =====================================
   GET USER
===================================== */

function getUser() {
  const user = state.currentUser || {};

  if (!user.coverPhoto) {
    try {
      user.coverPhoto =
        localStorage.getItem(getCoverStorageKey(user)) || "";
    } catch (error) {
      console.error("Could not load cover photo:", error);
    }
  }

  return user;
}

function getScore(user) {
  if (Number.isFinite(Number(user.verification_score))) {
    return Number(user.verification_score);
  }

  return required.reduce((total, [key, , weight]) => {
    const value =
      key === "photo" ? getPhoto(user) :
      key === "studentCard" ? getCard(user) :
      user[key];

    return total + (value ? weight : 0);
  }, 0);
}

function getInitials(name) {
  return String(name || "Student")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] || "")
    .join("")
    .toUpperCase();
}

function renderAvatar(user, large = false) {
  const photo = getPhoto(user);

  return `
    <div class="cp-profile-avatar ${large ? "large" : ""}">
      ${
        photo
          ? `<img src="${esc(photo)}" alt="Profile photo">`
          : `<span>${esc(getInitials(user.name))}</span>`
      }
    </div>
  `;
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(
      new Error("Could not read image.")
    );

    reader.readAsDataURL(file);
  });
}

function validateImage(file, label) {
  if (!file) return true;

  if (!file.type.startsWith("image/")) {
    toast(`Please select a valid ${label}.`);
    return false;
  }

  if (file.size > MAX_IMAGE_SIZE) {
    toast(`${label} must be smaller than 2 MB.`);
    return false;
  }

  return true;
}

/* =====================================
   LOAD PROFILE FROM BACKEND
===================================== */

let profileLoadStarted = false;

async function loadProfileFromBackend() {
  if (profileLoadStarted) return;

  profileLoadStarted = true;

  try {
    const data = await apiFetch("/me");
    const updatedUser = normalizeUser(data);

    state.currentUser = updatedUser;

    localStorage.setItem(
      "campuspool_name",
      updatedUser.name || ""
    );

    localStorage.setItem(
      "campuspool_department",
      updatedUser.department || ""
    );

    const root = document.querySelector("#view-root");

    if (root && root.querySelector(".cp-profile-page")) {
      root.innerHTML = renderProfile();
    }

  } catch (error) {
    console.error("Profile loading failed:", error);
    toast(error.message || "Could not load profile.");
  } finally {
    profileLoadStarted = false;
  }
}

/* =====================================
   COVER PHOTO
===================================== */

function renderCover(user) {
  const coverPhoto = user.coverPhoto || "";

  return `
    <section class="cp-cover"
      style="
        position:relative;
        background:
          ${coverPhoto
            ? `url('${esc(coverPhoto)}') center/cover no-repeat`
            : "linear-gradient(120deg,#073b4c,#087f75,#13c995)"
          };
      ">

      <div class="cp-cover-overlay"></div>

      ${
        !coverPhoto
          ? `<div class="cp-cover-label">
               CAMPUSPOOL STUDENT PROFILE
             </div>`
          : ""
      }

      <div style="
        position:absolute;
        right:18px;
        bottom:18px;
        z-index:5;
        display:flex;
        gap:8px;
        align-items:center;
      ">
        <button
          type="button"
          data-cover-trigger
          style="
            padding:10px 15px;
            border:1px solid rgba(255,255,255,.3);
            border-radius:9px;
            background:rgba(0,0,0,.65);
            color:white;
            font-size:13px;
            font-weight:600;
            cursor:pointer;
          "
        >
          📷 Change Cover Photo
        </button>

        <input
          type="file"
          id="cp-cover-input"
          accept="image/*"
          hidden
        >
      </div>
    </section>
  `;
}

/* =====================================
   ABOUT
===================================== */

function renderAbout(user) {
  const details = [
    ["University", user.university || "Not added"],
    ["Department", user.department || "Not added"],
    ["Student ID", user.studentId || user.student_id || "Not added"],
    ["Primary phone", user.phone1 || "Not added"],
    ["Alternative phone", user.phone2 || "Not added"]
  ];

  return `
    <div class="cp-about-card">
      <h3>About</h3>
      <p class="cp-muted">Your CampusPool student information</p>

      <div class="cp-about-list">
        ${details.map(([label, value]) => `
          <div class="cp-about-item">
            <span class="cp-about-icon">●</span>
            <div>
              <small>${esc(label)}</small>
              <strong>${esc(value)}</strong>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

/* =====================================
   VERIFICATION
===================================== */

function renderVerification(user) {
  const score = getScore(user);
  const canBook = user.can_book ?? score >= 90;
  const isVerified = user.is_verified === 1 || user.is_verified === true;

  const values = {
    photo: getPhoto(user),
    studentCard: getCard(user),
    phone1: user.phone1,
    phone2: user.phone2,
    department: user.department
  };

  return `
    <div class="cp-verification-card">

      <div class="cp-card-heading">
        <div>
          <h3>Profile verification</h3>
          <p>Complete your student profile to unlock ride requests.</p>
        </div>
        <span class="cp-score">${score}%</span>
      </div>

      <div class="cp-progress">
        <span style="width:${Math.min(score, 100)}%"></span>
      </div>

      <p class="cp-verification-status">
        ${
          canBook
            ? "✓ You have reached the 90% requirement."
            : `You need ${Math.max(0, 90 - score)}% more to request a ride.`
        }
      </p>

      ${isVerified ? `
        <div style="background: rgba(25, 213, 160, 0.1); border: 1px solid #19d5a0; padding: 10px; border-radius: 8px; margin-bottom: 20px; text-align: center; color: #19d5a0; font-weight: bold;">
          ✅ Student ID Verified Successfully
        </div>
      ` : `
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; padding: 10px; border-radius: 8px; margin-bottom: 20px; text-align: center; color: #ef4444; font-weight: bold;">
          ⚠️ ID Card Not Verified. Upload your Student Card below to verify.
        </div>
      `}

      <div class="cp-checklist">
        ${required.map(([key, label, weight]) => `
          <div class="cp-check-item">
            <span class="${values[key] ? "completed" : ""}">
              ${values[key] ? "✓" : "○"}
            </span>
            <div>
              <strong>${esc(label)}</strong>
              <small>${weight}% of completion score</small>
            </div>
            <small>${values[key] ? "Added" : "Needed"}</small>
          </div>
        `).join("")}
      </div>

    </div>
  `;
}

/* =====================================
   RIDES & REVIEWS
===================================== */

function renderRides() {
  return `
    <div class="cp-empty-card">
      <div class="cp-empty-icon">🚗</div>
      <h3>Your rides will appear here</h3>
      <p>Rides you post on CampusPool will be shown on your profile.</p>
    </div>
  `;
}

function renderReviews() {
  return `
    <div class="cp-empty-card">
      <div class="cp-empty-icon">⭐</div>
      <h3>No reviews yet</h3>
      <p>Reviews from other students will appear here.</p>
    </div>
  `;
}

/* =====================================
   EDIT FORM
===================================== */

function renderEditForm(user) {
  return `
    <div class="cp-edit-card" id="cp-edit-section">

      <div class="cp-edit-heading">
        <div>
          <h2>Edit profile</h2>
          <p>Update your student information.</p>
        </div>

        <button
          type="button"
          class="cp-secondary-btn"
          data-close-edit
        >
          Close
        </button>
      </div>

      <form id="profile-form" class="cp-edit-form">

        <label>
          Full name
          <input name="name" value="${esc(user.name)}" required>
        </label>

        <label>
          Student ID
          <input
            name="studentId"
            value="${esc(user.studentId || user.student_id)}"
            readonly
          >
        </label>

        <label>
          Department
          <select name="department" required>
            <option value="">Select department</option>
            ${[
              "CSE",
              "EEE",
              "BBA",
              "English",
              "Civil Engineering",
              "Law",
              "Textile Engineering",
              "Pharmacy",
              "Other"
            ].map(department => `
              <option
                value="${esc(department)}"
                ${user.department === department ? "selected" : ""}
              >
                ${esc(department)}
              </option>
            `).join("")}
          </select>
        </label>

        <label>
          Primary phone number
          <input
            name="phone1"
            type="tel"
            placeholder="01XXXXXXXXX"
            value="${esc(user.phone1)}"
            required
          >
        </label>

        <label>
          Alternative phone number
          <input
            name="phone2"
            type="tel"
            placeholder="01XXXXXXXXX"
            value="${esc(user.phone2)}"
            required
          >
        </label>

        <label>
          Profile photo
          <input name="photo" type="file" accept="image/*">
        </label>

        <label>
          Student ID card photo
          <input name="studentCard" type="file" accept="image/*">
        </label>

        <button class="cp-primary-btn" type="submit">
          Save changes
        </button>

      </form>
    </div>
  `;
}

/* =====================================
   MAIN PROFILE
===================================== */

export function renderProfile() {
  const user = getUser();

  loadProfileFromBackend();

  return `
    <div class="cp-profile-page">

      ${renderCover(user)}

      <section class="cp-profile-header">

        <div class="cp-profile-identity">
          ${renderAvatar(user, true)}

          <div class="cp-profile-name">
            <h1>${esc(user.name || "CampusPool Student")}</h1>

            <p>
              ${esc(user.department || "Student")}
              ${user.university ? ` · ${esc(user.university)}` : ""}
            </p>

            <span class="cp-profile-subtitle">
              CampusPool student community
            </span>
          </div>
        </div>

        <div class="cp-profile-actions">
          <button
            class="cp-primary-btn"
            type="button"
            data-edit-profile
          >
            ✎ Edit profile
          </button>
        </div>

      </section>

      <nav class="cp-profile-tabs">
        <button class="active" data-profile-tab="about">About</button>
        <button data-profile-tab="rides">My Rides</button>
        <button data-profile-tab="reviews">Reviews</button>
      </nav>

      <div id="cp-edit-container" hidden>
        ${renderEditForm(user)}
      </div>

      <section class="cp-profile-content">

        <div class="cp-profile-main" id="cp-profile-tab-content">
          ${renderAbout(user)}
        </div>

        <aside class="cp-profile-sidebar">
          ${renderVerification(user)}
        </aside>

      </section>

    </div>
  `;
}

/* =====================================
   CLICK INTERACTIONS
===================================== */

document.addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit-profile]");
  const closeButton = event.target.closest("[data-close-edit]");
  const tabButton = event.target.closest("[data-profile-tab]");
  const coverButton = event.target.closest("[data-cover-trigger]");

  if (coverButton) {
    document.querySelector("#cp-cover-input")?.click();
    return;
  }

  if (editButton) {
    const container = document.querySelector("#cp-edit-container");

    if (container) {
      container.hidden = false;
      container.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
    return;
  }

  if (closeButton) {
    const container = document.querySelector("#cp-edit-container");
    if (container) container.hidden = true;
    return;
  }

  if (tabButton) {
    document.querySelectorAll("[data-profile-tab]")
      .forEach(button => {
        button.classList.toggle("active", button === tabButton);
      });

    const content = document.querySelector("#cp-profile-tab-content");
    const user = getUser();
    const tab = tabButton.dataset.profileTab;

    if (!content) return;

    if (tab === "about") content.innerHTML = renderAbout(user);
    if (tab === "rides") content.innerHTML = renderRides();
    if (tab === "reviews") content.innerHTML = renderReviews();
  }
});

/* =====================================
   COVER PHOTO UPLOAD
===================================== */

document.addEventListener("change", async event => {
  if (event.target.id !== "cp-cover-input") return;

  const file = event.target.files?.[0];
  if (!file) return;

  if (!validateImage(file, "Cover photo")) {
    event.target.value = "";
    return;
  }

  try {
    const imageData = await readImage(file);
    const user = getUser();

    user.coverPhoto = imageData;

    localStorage.setItem(
      getCoverStorageKey(user),
      imageData
    );

    const cover = document.querySelector(".cp-cover");

    if (cover) {
      cover.style.background =
        `url("${imageData}") center/cover no-repeat`;

      cover.querySelector(".cp-cover-label")?.remove();
    }

    toast("Cover photo updated successfully!");

  } catch (error) {
    console.error(error);
    toast("Could not upload cover photo.");
  }

  event.target.value = "";
});

/* =====================================
   SAVE PROFILE TO BACKEND
===================================== */

document.addEventListener("submit", async event => {
  if (event.target.id !== "profile-form") return;

  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const user = getUser();

  const submitButton = form.querySelector('button[type="submit"]');

  const name = String(formData.get("name") || "").trim();
  const department = String(formData.get("department") || "").trim();
  const phone1 = String(formData.get("phone1") || "").trim();
  const phone2 = String(formData.get("phone2") || "").trim();

  if (!name || !department) {
    toast("Please enter your name and department.");
    return;
  }

  if (!/^01[3-9]\d{8}$/.test(phone1) || !/^01[3-9]\d{8}$/.test(phone2)) {
    toast("Enter valid Bangladeshi phone numbers.");
    return;
  }

  const photoFile = form.elements.photo.files[0];
  const cardFile = form.elements.studentCard.files[0];

  if (!validateImage(photoFile, "Profile photo")) return;
  if (!validateImage(cardFile, "Student ID card photo")) return;

  try {
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";

    let cardData = "";
    
    // ==========================================
    // NEW: Tesseract দিয়ে কার্ড ভেরিফিকেশন
    // ==========================================
    if (cardFile) {
      submitButton.textContent = "Reading Student Card...";
      toast("Reading your ID card... Please wait.");

      const result = await Tesseract.recognize(cardFile, 'eng');
      const extractedText = result.data.text;

      cardData = await readImage(cardFile);
      
      // সার্ভারে ছবি এবং টেক্সট পাঠানো (সার্ভার চেক করবে এটা আসল কার্ড কিনা)
      await apiFetch("/me/verify", {
        method: "PATCH",
        body: JSON.stringify({ 
          student_card: cardData,
          extracted_text: extractedText 
        })
      });

      toast("✅ Card Verified! Saving profile...");
    }

    const photoData = photoFile ? await readImage(photoFile) : "";

    // 1. Update normal profile information.
    const profilePayload = {
      name,
      department,
      phone1,
      phone2
    };

    if (cardData) {
      profilePayload.student_card = cardData;
    }

    await apiFetch("/me/profile", {
      method: "PATCH",
      body: JSON.stringify(profilePayload)
    });

    // 2. Save profile picture to backend.
    if (photoData) {
      await apiFetch("/me/profile-picture", {
        method: "PATCH",
        body: JSON.stringify({
          profile_picture: photoData
        })
      });
    }

    // 3. Fetch latest information from backend.
    const latestData = await apiFetch("/me");
    const updatedUser = normalizeUser(latestData);

    state.currentUser = {
      ...user,
      ...updatedUser
    };

    // Images are NOT saved in localStorage.
    // Only small text information is cached.
    localStorage.setItem("campuspool_name", name);
    localStorage.setItem("campuspool_department", department);

    // Update header.
    const headerName = document.querySelector("#header-username");
    const sidebarName = document.querySelector("#sidebar-username");

    if (headerName) headerName.textContent = name;
    if (sidebarName) sidebarName.textContent = name;

    // Refresh profile screen.
    const root = document.querySelector("#view-root");

    if (root) {
      root.innerHTML = renderProfile();
    }

    toast(
      `Profile saved successfully. Completion: ${getScore(state.currentUser)}%.`
    );

  } catch (error) {
    console.error("Profile save failed:", error);
    toast(error.message || "Could not save profile.");

  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Save changes";
  }
});