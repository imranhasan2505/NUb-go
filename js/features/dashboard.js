import { state } from "../state.js";
import { apiFetch } from "../api.js";

export function renderDashboard() {
  const bookings = state.bookings || [];
  const notifications = state.notifications || [];
  const unread = notifications.filter(n => n.unread).length;

  return `
  <div class="cp-dashboard">

    <section class="cp-welcome">
      <div class="cp-welcome-overlay"></div>

      <div class="cp-welcome-content">
        <div class="cp-eyebrow">NORTHERN UNIVERSITY BANGLADESH</div>
        <div class="cp-welcome-tag">✦ CAMPUSPOOL COMMUNITY</div>

        <h1>Your journey,<br><span>made better.</span></h1>

        <p>
          Share your ride, meet fellow students and make every
          campus journey easier, safer and more affordable.
        </p>

        <div class="cp-welcome-actions">
          <button class="cp-btn cp-btn-primary" data-view="post-ride">
            ＋ Post a ride
          </button>

          <button class="cp-btn cp-btn-glass" data-view="find-rides">
            Find a ride →
          </button>
        </div>

        <div class="cp-trust">
          <span>✦</span> Student-to-student ride sharing
        </div>
      </div>

      <div class="cp-visual">
        <div class="cp-visual-circle"></div>
        <div class="cp-visual-road"></div>
        <div class="cp-car">🚙</div>
        <div class="cp-floating cp-float-one">৳ Share the cost</div>
        <div class="cp-floating cp-float-two">✦ Travel together</div>
        <div class="cp-visual-label">CAMPUSPOOL</div>
      </div>

      <div class="cp-hero-bottom">
        <span>🎓</span>
        <div>
          <strong>One campus, one community</strong>
          <small>Better journeys start together.</small>
        </div>
      </div>
    </section>

    <div class="cp-section-heading">
      <div>
        <span class="cp-eyebrow">YOUR OVERVIEW</span>
        <h2>Your activity</h2>
      </div>
      <button class="cp-text-btn" data-view="activities">
        View activities →
      </button>
    </div>

    <section class="cp-stats">
      <article class="cp-stat">
        <div class="cp-stat-icon cp-icon-green">↗</div>
        <div class="cp-stat-label">Available rides</div>
        <div class="cp-stat-number" id="cp-available-count">—</div>
        <div class="cp-stat-note">Open rides from students</div>
      </article>

      <article class="cp-stat">
        <div class="cp-stat-icon cp-icon-blue">♧</div>
        <div class="cp-stat-label">My bookings</div>
        <div class="cp-stat-number">${bookings.length}</div>
        <div class="cp-stat-note">Your requested rides</div>
      </article>

      <article class="cp-stat">
        <div class="cp-stat-icon cp-icon-purple">✦</div>
        <div class="cp-stat-label">Notifications</div>
        <div class="cp-stat-number">${unread}</div>
        <div class="cp-stat-note">Unread updates</div>
      </article>

      <article class="cp-stat">
        <div class="cp-stat-icon cp-icon-orange">＋</div>
        <div class="cp-stat-label">Get started</div>
        <div class="cp-stat-number">1 ride</div>
        <div class="cp-stat-note">Can make a difference</div>
      </article>
    </section>

    <div class="cp-main-grid">

      <section class="cp-section cp-rides-section">
        <div class="cp-section-heading">
          <div>
            <span class="cp-eyebrow">FIND YOUR RIDE PARTNER</span>
            <h2>Rides for you</h2>
            <p>Explore rides shared by fellow students.</p>
          </div>
          <button class="cp-text-btn" data-view="find-rides">See all →</button>
        </div>

        <div class="cp-rides-list" id="cp-dashboard-rides">
          <div class="cp-loading">Finding available rides...</div>
        </div>
      </section>

      <section class="cp-section cp-shortcuts-section">
        <div class="cp-section-heading">
          <div>
            <span class="cp-eyebrow">EXPLORE CAMPUSPOOL</span>
            <h2>Quick access</h2>
            <p>Everything you need in one place.</p>
          </div>
        </div>

        <div class="cp-shortcuts">
          <button class="cp-shortcut" data-view="activities">
            <span class="cp-shortcut-icon cp-icon-green">♧</span>
            <span><strong>My activities</strong><small>Manage rides and bookings</small></span>
            <b>→</b>
          </button>

          <button class="cp-shortcut" data-view="chat">
            <span class="cp-shortcut-icon cp-icon-blue">☏</span>
            <span><strong>Messages</strong><small>Chat with ride partners</small></span>
            <b>→</b>
          </button>

          <button class="cp-shortcut" data-view="recurring">
            <span class="cp-shortcut-icon cp-icon-purple">◷</span>
            <span><strong>Recurring rides</strong><small>Plan your regular commute</small></span>
            <b>→</b>
          </button>

          <button class="cp-shortcut" data-view="safety">
            <span class="cp-shortcut-icon cp-icon-orange">⛨</span>
            <span><strong>Safety centre</strong><small>Travel with awareness</small></span>
            <b>→</b>
          </button>

          <button class="cp-shortcut" data-view="profile">
            <span class="cp-shortcut-icon cp-icon-pink">☺</span>
            <span><strong>My profile</strong><small>Manage your information</small></span>
            <b>→</b>
          </button>
        </div>
      </section>

    </div>

    <section class="cp-bottom-grid">

      <div class="cp-community-card">
        <div class="cp-community-icon">🌱</div>
        <div>
          <span class="cp-eyebrow">BETTER TOGETHER</span>
          <h2>One ride. More connections.</h2>
          <p>
            Share your journey with fellow students. Save on travel
            costs and build a stronger campus community.
          </p>
          <button class="cp-btn cp-btn-dark" data-view="post-ride">
            Share your ride →
          </button>
        </div>
      </div>

      <div class="cp-updates">
        <div class="cp-section-heading">
          <div>
            <span class="cp-eyebrow">STAY CONNECTED</span>
            <h2>Latest updates</h2>
          </div>
          <button class="cp-text-btn" data-view="notifications">
            View all →
          </button>
        </div>

        <div class="cp-notification-list">
          ${
            notifications.length
              ? notifications.slice(0, 3).map(n => `
                <div class="cp-notification">
                  <span class="cp-notice-icon">
                    ${n.kind === "safety" ? "⛨" : n.kind === "ride" ? "↗" : "✦"}
                  </span>
                  <div>
                    <strong>${esc(n.title)}</strong>
                    <p>${esc(n.text)}</p>
                    <small>${esc(n.time)}</small>
                  </div>
                  ${n.unread ? '<i class="cp-unread"></i>' : ""}
                </div>
              `).join("")
              : `<div class="cp-empty">You're all caught up! No updates yet.</div>`
          }
        </div>
      </div>

    </section>
  </div>
  `;
}

export async function loadDashboardRides() {
  const container = document.querySelector("#cp-dashboard-rides");
  const count = document.querySelector("#cp-available-count");

  if (!container) return;

  try {
    const data = await apiFetch("/rides");
    const myId = Number(localStorage.getItem("campuspool_user_id"));

    const rides = (data.rides || []).filter(
      r => Number(r.owner_id) !== myId
    );

    if (count) count.textContent = rides.length;

    if (!rides.length) {
      container.innerHTML = `
        <div class="cp-empty">
          <strong>No rides available right now.</strong><br>
          অন্য শিক্ষার্থী Ride Post করলে এখানে দেখা যাবে।
          <br><br>
          <button class="cp-btn cp-btn-primary" data-view="post-ride">
            Post a ride
          </button>
        </div>`;
      return;
    }

    // রাইড কার্ডে অপ্রয়োজনীয় 'A' বাদ দেওয়া হয়েছে
    container.innerHTML = rides.slice(0, 4).map(r => {
      const name = esc(r.driver_name || "Student");
      const from = esc(r.from_location);
      const to = esc(r.to_location);
      const vehicle = esc(r.vehicle || "Vehicle");
      const fare = Number(r.fare_per_person || 0);
      const date = new Date(r.departure_at);

      return `
        <article class="cp-ride">
          <div class="cp-ride-avatar">${name.charAt(0).toUpperCase()}</div>

          <div class="cp-ride-info">
            <strong>${name}</strong>
            <small>
              ${vehicle} · ${Number(r.seats_available || 0)} seats available
            </small>

            <div class="cp-ride-route">
              <span>${from}</span><b>→</b><span>${to}</span>
            </div>

            <small>
              ${date.toLocaleDateString()} ·
              ${date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
              })}
            </small>
          </div>

          <div class="cp-ride-price">
            <strong>৳${fare.toFixed(0)}</strong>
            <small>per person</small>
            <button data-view="find-rides">View ride →</button>
          </div>
        </article>`;
    }).join("");

  } catch (error) {
    container.innerHTML = `
      <div class="cp-empty">
        Could not load rides.<br>${esc(error.message)}
      </div>`;
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}