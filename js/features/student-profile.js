
import { state } from "../state.js";
import { apiFetch } from "../api.js";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function initials(name) {
  return String(name || "Student")
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function renderStudentAvatar(user) {
  const name = esc(user.name || "Student");
  const photo = user.profile_picture || user.photo || "";

  if (!photo) {
    return `
      <div class="student-profile-avatar">
        ${esc(initials(user.name))}
      </div>
    `;
  }

  return `
    <div class="student-profile-avatar-wrapper"
      style="position:relative;width:140px;height:140px;margin:0 auto 18px;">

      <img
        class="student-profile-photo"
        src="${esc(photo)}"
        alt="${name}"
        style="
          width:140px;
          height:140px;
          border-radius:50%;
          object-fit:cover;
          display:block;
        "
        onerror="
          this.style.display='none';
          this.nextElementSibling.style.display='flex';
        "
      >

      <div
        class="student-profile-avatar"
        style="
          display:none;
          position:absolute;
          inset:0;
          width:140px;
          height:140px;
          border-radius:50%;
          align-items:center;
          justify-content:center;
        "
      >
        ${esc(initials(user.name))}
      </div>

    </div>
  `;
}

export function renderStudentProfile() {
  return `
    <section class="student-profile-page">

      <button
        class="btn btn-secondary"
        type="button"
        data-view="safety"
      >
        ← Back to Safety Centre
      </button>

      <div
        id="student-profile-content"
        class="student-profile-card"
      >
        <p>Loading student profile...</p>
      </div>

    </section>
  `;
}

export async function loadStudentProfile() {
  const container = document.querySelector(
    "#student-profile-content"
  );

  if (!container) return;

  const userId = Number(state.viewedStudentId);

  if (!Number.isInteger(userId) || userId <= 0) {
    container.innerHTML = "<p>Student profile not found.</p>";
    return;
  }

  try {
    const response = await apiFetch(`/users/${userId}`);
    const user = response.user;

    if (!user) {
      throw new Error("Student profile not found.");
    }

    const joinedDate = user.created_at
      ? new Date(
          user.created_at.replace(" ", "T") + "Z"
        ).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric"
        })
      : "Not available";

    container.innerHTML = `
      <div class="student-profile-header">

        ${renderStudentAvatar(user)}

        <h2>${esc(user.name || "CampusPool Student")}</h2>

        <p>CampusPool Student</p>

      </div>

      <div class="student-profile-info">

        <div class="student-info-item">
          <span>Student ID</span>
          <strong>${esc(user.student_id || "Not added")}</strong>
        </div>

        <div class="student-info-item">
          <span>Department</span>
          <strong>${esc(user.department || "Not added")}</strong>
        </div>

        <div class="student-info-item">
          <span>University</span>
          <strong>${esc(user.university || "Not added")}</strong>
        </div>

        <div class="student-info-item">
          <span>Joined CampusPool</span>
          <strong>${esc(joinedDate)}</strong>
        </div>

      </div>
    `;

    // Debug information for profile picture.
    console.log("Student Profile Picture:", user.profile_picture);

  } catch (error) {
    console.error("Student profile loading failed:", error);

    container.innerHTML = `
      <p>Could not load student profile.</p>
      <p>${esc(error.message)}</p>
    `;
  }
}
