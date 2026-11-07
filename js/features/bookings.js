
import { apiFetch } from "../api.js";
import { toast, navigate } from "../app.js";
import { state } from "../state.js";

export function renderBookings() {
  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow">YOUR RIDES, ONE PLACE</div>
        <h1>My bookings</h1>
        <p>Booking requests and posted rides from the shared server.</p>
      </div>
      <button class="btn btn-primary" data-view="find-rides">
        Find a ride
      </button>
    </div>

    <div id="bookings-server-content">
      <div class="panel empty-state">Loading your bookings...</div>
    </div>
  `;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

export async function loadBookings() {
  const el = document.querySelector("#bookings-server-content");
  if (!el) return;

  try {
    const data = await apiFetch("/bookings");
    const rows = data.bookings || [];

    const userId = Number(localStorage.getItem("campuspool_user_id"));

    const outgoing = rows.filter(
      b => Number(b.passenger_id) === userId
    );

    const requestRows = rows.filter(
      b => Number(b.owner_id) === userId
    );

    const row = b => `
      <div class="booking-row">

        <div class="booking-date">
          <strong>
            ${new Date(b.departure_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            })}
          </strong>
          <small>
            ${new Date(b.departure_at).toLocaleDateString()}
          </small>
        </div>

        <div class="booking-route">
          <strong>
            ${esc(b.from_location)} → ${esc(b.to_location)}
          </strong>

          <small>
            ${
              Number(b.owner_id) === userId
                ? `Passenger: ${esc(b.passenger_name)}`
                : `Ride Creator: ${esc(b.driver_name)}`
            }
            · ${esc(b.vehicle)}
            · ৳${esc(b.fare_per_person)}/person
          </small>
        </div>

        <div class="booking-fare">
          <span class="pill ${
            b.status === "confirmed" ? "green" :
            b.status === "pending" ? "amber" : ""
          }">
            ${esc(b.status)}
          </span>
        </div>

        <button
          class="btn btn-secondary btn-small"
          data-open-ride="${Number(b.ride_id)}">
          View Details
        </button>

        ${
          Number(b.owner_id) === userId && b.status === "pending"
            ? `
              <button
                class="btn btn-primary btn-small"
                data-booking-status="confirmed"
                data-booking-id="${Number(b.id)}">
                Confirm
              </button>

              <button
                class="btn btn-secondary btn-small"
                data-booking-status="rejected"
                data-booking-id="${Number(b.id)}">
                Reject
              </button>
            `
            : ""
        }

      </div>
    `;

    el.innerHTML = `
      <div class="grid grid-3">

        <article class="stat-card">
          <div class="stat-top">Booking records</div>
          <div class="stat-value">${rows.length}</div>
          <div class="stat-foot">Shared database records</div>
        </article>

        <article class="stat-card">
          <div class="stat-top">Requests on my rides</div>
          <div class="stat-value">
            ${requestRows.filter(b => b.status === "pending").length}
          </div>
          <div class="stat-foot">Waiting for your response</div>
        </article>

        <article class="stat-card">
          <div class="stat-top">My ride requests</div>
          <div class="stat-value">${outgoing.length}</div>
          <div class="stat-foot">Requested by this account</div>
        </article>

      </div>

      <section class="panel section-gap">

        <div class="panel-head">
          <div>
            <h2>Booking activity</h2>
            <p>View your bookings and manage incoming requests.</p>
          </div>
        </div>

        <div class="panel-body">
          ${
            rows.length
              ? rows.map(row).join("")
              : `
                <div class="empty-state">
                  <strong>No bookings yet</strong>
                  When you request a ride or another student requests yours, it appears here.
                </div>
              `
          }
        </div>

      </section>

      <p class="field-hint section-gap">
        Your booking information is stored in the shared database.
      </p>
    `;

  } catch (e) {
    el.innerHTML = `
      <div class="panel empty-state">
        <strong>Could not load bookings</strong>
        ${esc(e.message)}
      </div>
    `;
  }
}

// BUTTON ACTIONS

document.addEventListener("click", async e => {

  // VIEW RIDE DETAILS
  const detailsButton = e.target.closest("[data-open-ride]");

  if (detailsButton) {
    const rideId = Number(detailsButton.dataset.openRide);

    if (!rideId) {
      toast("Invalid ride.");
      return;
    }

    state.selectedRideId = rideId;
    navigate("ride-details");
    return;
  }

  // CONFIRM OR REJECT BOOKING
  const button = e.target.closest("[data-booking-status]");

  if (!button) return;

  try {
    button.disabled = true;

    await apiFetch(
      `/bookings/${Number(button.dataset.bookingId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: button.dataset.bookingStatus
        })
      }
    );

    toast(`Booking ${button.dataset.bookingStatus}.`);
    loadBookings();

  } catch (err) {
    toast(err.message);
    button.disabled = false;
  }
});

