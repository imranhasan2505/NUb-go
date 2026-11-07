import { state } from "../state.js";
import { apiFetch } from "../api.js";

export function renderFemaleOnly() {
  // পেজ লোড হওয়ার পর সার্ভার থেকে আসল ডাটা আনবে
  setTimeout(loadFemaleOnlyRides, 0);

  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow">A MORE COMFORTABLE COMMUTE</div>
        <h1>Female-only rides <span class="text-pink">♡</span></h1>
        <p>Browse rides marked for eligible female student passengers.</p>
      </div>
      <span class="pill pink">FEATURE 05</span>
    </div>

    <section class="female-banner">
      <div>
        <span class="pill pink">COMMUNITY SAFETY</span>
        <h2>Comfort in every<br>shared journey.</h2>
        <p>Clear ride preferences, profile checks and respectful community guidelines help students travel with more confidence.</p>
        <button class="btn btn-secondary" data-view="safety">Explore safety tools →</button>
      </div>
      <div class="female-illustration">
        <div class="female-orbit"></div>
        <span>♡</span>
        <small>TRAVEL TOGETHER</small>
      </div>
    </section>

    <div class="panel section-gap">
      <div class="panel-head">
        <div>
          <h2>Available female-only rides</h2>
          <p id="female-ride-count">Loading real rides from server...</p>
        </div>
        <span class="pill pink" style="background: #ec4899; color: white;">LIVE DATA</span>
      </div>
      
      <div class="panel-body">
        <div class="ride-cards" id="female-rides-container">
          <p class="field-hint">Fetching available rides...</p>
        </div>
      </div>
    </div>
  `;
}

async function loadFemaleOnlyRides() {
  const container = document.querySelector("#female-rides-container");
  const countLabel = document.querySelector("#female-ride-count");

  if (!container) return;

  try {
    const data = await apiFetch("/rides");
    
    // শুধু ফিমেল-অনলি রাইডগুলো ফিল্টার করা হচ্ছে
    const rides = (data.rides || []).filter(r => r.female_only === true);

    if (countLabel) {
      countLabel.textContent = `${rides.length} ride(s) available in real-time`;
    }

    if (rides.length === 0) {
      container.innerHTML = `<div class="empty-state">No female-only rides available right now. Check back later.</div>`;
      return;
    }

    container.innerHTML = rides.map(r => {
      const date = new Date(r.departure_at);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      // ড্রাইভারের নামের প্রথম অক্ষর
      const initial = (r.driver_name || "Student").charAt(0).toUpperCase();
      const fare = Number(r.fare_per_person || 0).toFixed(0);
      const seatsLeft = Math.max(0, r.seats_total - r.seats_booked);

      return `
        <article class="ride-card">
          <div class="ride-card-top">
            <div class="avatar" style="background: #f9a8d4; color: #831843;">${initial}</div>
            <div class="person">
              <strong>${escapeHTML(r.driver_name)}</strong>
              <small>★ 5.0 · ${escapeHTML(r.vehicle)} · ${seatsLeft} seats left</small>
            </div>
            <span class="pill pink">♡ Female-only</span>
          </div>
          
          <div class="ride-card-route">
            <div class="route-point">
              <small>PICKUP · ${timeStr}</small>
              <strong>${escapeHTML(r.from_location)}</strong>
            </div>
            <div class="route-point">
              <small>DESTINATION</small>
              <strong>${escapeHTML(r.to_location)}</strong>
            </div>
          </div>
          
          <div class="ride-card-bottom">
            <div>
              <strong>৳${fare}</strong>
              <small>estimated / person</small>
            </div>
            <button class="btn btn-primary btn-small" data-join-ride="${r.id}">Request seat →</button>
          </div>
        </article>
      `;
    }).join("");

  } catch (error) {
    if (container) {
      container.innerHTML = `<div class="empty-state" style="color:red;">Could not load rides: ${escapeHTML(error.message)}</div>`;
    }
  }
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