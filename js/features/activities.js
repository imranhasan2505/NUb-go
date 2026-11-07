
import { apiFetch } from "../api.js";

export function renderActivities() {
  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow">YOUR CAMPUSPOOL ACCOUNT</div>
        <h1>My Activities</h1>
        <p>Manage your posted rides, incoming requests and bookings.</p>
      </div>
      <button class="btn btn-primary" data-view="post-ride">
        ＋ Post a ride
      </button>
    </div>

    <div id="activities-content">
      <div class="panel empty-state">Loading your activities...</div>
    </div>
  `;
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

export async function loadActivities() {
  const el = document.querySelector("#activities-content");
  if (!el) return;

  try {
    const [rideData, bookingData] = await Promise.all([
      apiFetch("/owner/rides"),
      apiFetch("/bookings")
    ]);

    const rides = rideData.rides || [];
    const bookings = bookingData.bookings || [];
    const myId = Number(localStorage.getItem("campuspool_user_id"));

    const outgoing = bookings.filter(
      b => Number(b.passenger_id) === myId
    );

    const incoming = bookings.filter(
      b => Number(b.owner_id) === myId
    );

    const pending = incoming.filter(b => b.status === "pending");

    const rideCards = rides.length
      ? rides.map(r => `
        <article class="booking-row">
          <div class="booking-route">
            <strong>${esc(r.from_location)} → ${esc(r.to_location)}</strong>
            <small>
              ${esc(r.vehicle)} ·
              ${new Date(r.departure_at).toLocaleString()}
            </small>
            <small>
              Total fare: ৳${Number(r.total_fare).toFixed(0)}
              · ৳${Number(r.fare_per_person).toFixed(0)} per person
            </small>
            <small>
              ${Number(r.seats_booked || 0)} joined /
              ${Number(r.seats_total || 0)} other-student seats
            </small>
          </div>
          <div class="booking-fare">
            <span class="pill ${r.status === "open" ? "green" : "amber"}">
              ${esc(r.status)}
            </span>
            <small>${Number(r.pending_requests || 0)} pending requests</small>
          </div>
        </article>
      `).join("")
      : `<div class="empty-state">
          <strong>You haven't posted a ride yet.</strong>
          Your published rides will appear here.
        </div>`;

    const requestRows = incoming.length
      ? incoming.map(b => `
        <article class="booking-row">
          <div class="booking-route">
            <strong>${esc(b.from_location)} → ${esc(b.to_location)}</strong>
            <small>Student: ${esc(b.passenger_name)}</small>
            <small>
              ${new Date(b.departure_at).toLocaleString()}
              · ${esc(b.vehicle)}
            </small>
          </div>
          <div class="booking-fare">
            <span class="pill ${
              b.status === "confirmed" ? "green" :
              b.status === "pending" ? "amber" : ""
            }">${esc(b.status)}</span>
          </div>
          ${b.status === "pending" ? `
            <button class="btn btn-primary btn-small"
              data-activity-booking-status="confirmed"
              data-booking-id="${Number(b.id)}">Accept</button>
            <button class="btn btn-secondary btn-small"
              data-activity-booking-status="rejected"
              data-booking-id="${Number(b.id)}">Reject</button>
          ` : ""}
        </article>
      `).join("")
      : `<div class="empty-state">
          <strong>No booking requests yet.</strong>
          Requests from other students will appear here.
        </div>`;

    const outgoingRows = outgoing.length
      ? outgoing.map(b => `
        <article class="booking-row">
          <div class="booking-route">
            <strong>${esc(b.from_location)} → ${esc(b.to_location)}</strong>
            <small>Ride creator: ${esc(b.driver_name)}</small>
            <small>
              ${new Date(b.departure_at).toLocaleString()}
              · ${esc(b.vehicle)}
            </small>
            <small>
              ৳${Number(b.fare_per_person).toFixed(0)} per person
            </small>
          </div>
          <div class="booking-fare">
            <span class="pill ${
              b.status === "confirmed" ? "green" :
              b.status === "pending" ? "amber" : ""
            }">${esc(b.status)}</span>
          </div>
        </article>
      `).join("")
      : `<div class="empty-state">
          <strong>You haven't requested any rides.</strong>
          Rides you request will appear here.
        </div>`;

    el.innerHTML = `
      <div class="grid grid-3">
        <article class="stat-card">
          <div class="stat-top">My posted rides</div>
          <div class="stat-value">${rides.length}</div>
          <div class="stat-foot">Rides created by you</div>
        </article>

        <article class="stat-card">
          <div class="stat-top">Incoming requests</div>
          <div class="stat-value">${pending.length}</div>
          <div class="stat-foot">Waiting for your response</div>
        </article>

        <article class="stat-card">
          <div class="stat-top">My ride bookings</div>
          <div class="stat-value">${outgoing.length}</div>
          <div class="stat-foot">Rides requested by you</div>
        </article>
      </div>

      <section class="panel section-gap">
        <div class="panel-head">
          <div>
            <h2>My Posted Rides</h2>
            <p>Rides you have published.</p>
          </div>
        </div>
        <div class="panel-body">${rideCards}</div>
      </section>

      <section class="panel section-gap">
        <div class="panel-head">
          <div>
            <h2>Incoming Requests</h2>
            <p>Accept or reject requests from other students.</p>
          </div>
        </div>
        <div class="panel-body">${requestRows}</div>
      </section>

      <section class="panel section-gap">
        <div class="panel-head">
          <div>
            <h2>My Bookings</h2>
            <p>Rides you have requested from other students.</p>
          </div>
        </div>
        <div class="panel-body">${outgoingRows}</div>
      </section>
    `;

  } catch (error) {
    el.innerHTML = `
      <div class="panel empty-state">
        <strong>Could not load activities</strong>
        ${esc(error.message)}
      </div>
    `;
  }
}

// Separate event handler for My Activities buttons.
document.addEventListener("click", async e => {
  const button = e.target.closest("[data-activity-booking-status]");
  if (!button) return;

  const status = button.dataset.activityBookingStatus;
  const bookingId = Number(button.dataset.bookingId);

  button.disabled = true;

  try {
    await apiFetch(`/bookings/${bookingId}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });

    await loadActivities();
    alert(`Booking ${status}.`);

  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
});
