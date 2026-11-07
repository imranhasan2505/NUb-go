
import { state } from "../state.js";
import { toast, openModal, navigate } from "../app.js";
import { apiFetch } from "../api.js";

let backendRides = [];

// ======================================
// RENDER RIDES
// ======================================

export function renderRides(mode = "find") {
  if (mode === "post") {
    return `
      <div class="page-heading">
        <div>
          <div class="eyebrow">MAKE ROOM FOR ANOTHER STUDENT</div>
          <h1>Post a ride</h1>
          <p>Share your route and split the total travel cost.</p>
        </div>
        <span class="pill">BACKEND CONNECTED</span>
      </div>

      <div class="grid grid-2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Ride details</h2>
              <p>Fields marked * are required</p>
            </div>
          </div>

          <div class="panel-body">
            <form id="post-ride-form" class="form-grid">

              <div class="field">
                <label>Pickup location *</label>
                <input name="from" required placeholder="e.g. Bashundhara R/A">
              </div>

              <div class="field">
                <label>Destination *</label>
                <input name="to" required placeholder="e.g. Northern University">
              </div>

              <div class="field">
                <label>Date *</label>
                <input name="date" id="ride-date" type="date" required>
                <small class="field-hint">
                  Select today's date. Only today's rides are allowed.
                </small>
              </div>

              <div class="field">
                <label>Departure time *</label>
                <input
                  name="time"
                  id="ride-time"
                  type="time"
                  required
                  aria-label="Select your ride departure time"
                >
                <small class="field-hint">
                  Select the time when you plan to leave your pickup location.
                  For example: 08:30 AM or 02:30 PM.
                </small>
              </div>

              <div class="field">
                <label>How many other students do you need? *</label>
                <select name="partnerCount" id="partner-count" required>
                  <option value="" selected disabled>Select number</option>
                  <option value="1">1 student (2 people including you)</option>
                  <option value="2">2 students (3 people including you)</option>
                  <option value="3">3 students (4 people including you)</option>
                </select>
                <small class="field-hint">
                  Select the number of students joining you. You are counted separately.
                </small>
              </div>

              <div class="field">
                <label>Vehicle type *</label>
                <select name="vehicle" required>
                  <option value="Car">Car</option>
                  <option value="Bike">Bike</option>
                  <option value="Rickshaw">Rickshaw</option>
                </select>
              </div>

              <div class="field field-full">
                <label>Total estimated fare (৳) *</label>
                <input
                  name="totalFare"
                  id="total-fare"
                  type="number"
                  min="2"
                  step="1"
                  required
                  placeholder="Enter the complete ride fare"
                >
                <small class="field-hint">
                  Enter the total fare for the entire journey, not the fare per person.
                </small>
              </div>

              <div class="field field-full">
                <div class="panel panel-body">
                  <div class="muted">FARE SPLIT SUMMARY</div>
                  <h2 id="fare-per-person">Select students and enter fare</h2>
                  <p class="field-hint">Estimated fare per person</p>
                  <p class="field-hint" id="fare-formula">
                    Total fare ÷ everyone travelling (including you)
                  </p>
                </div>
              </div>

              <div class="field field-full">
                <label class="checkbox-line">
                  <input name="femaleOnly" type="checkbox">
                  Female-only ride
                </label>
              </div>

              <div class="field field-full">
                <button class="btn btn-primary" type="submit">
                  ＋ Publish ride
                </button>
                <small class="field-hint">
                  Your ride will be saved in the shared database.
                </small>
              </div>
            </form>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Posting checklist</h2>
              <p>Help other students feel confident</p>
            </div>
          </div>

          <div class="panel-body checklist">
            <div>
              <i>✓</i>
              <span>
                <strong>Be clear about pickup</strong>
                <small>Use a known landmark.</small>
              </span>
            </div>

            <div>
              <i>✓</i>
              <span>
                <strong>Fair fare sharing</strong>
                <small>Everyone pays an equal share, including you.</small>
              </span>
            </div>

            <div>
              <i>✓</i>
              <span>
                <strong>Choose your ride partners</strong>
                <small>Select 1, 2 or 3 other students.</small>
              </span>
            </div>

            <div class="safety-callout">
              <strong>Safety note</strong>
              <p>
                This MVP does not verify real university identity.
                Use test details only.
              </p>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow">FIND YOUR CAMPUS CONNECTION</div>
        <h1>Find a ride</h1>
        <p>Ride posts are shared across accounts using this server.</p>
      </div>
      <button class="btn btn-primary" data-view="post-ride">
        ＋ Post a ride
      </button>
    </div>

    <div class="panel panel-body">
      <div class="form-grid">
        <div class="field">
          <label>From</label>
          <input
            id="filter-from"
            value="${escapeAttr(state.filters.from)}"
            placeholder="Your pickup location">
        </div>

        <div class="field">
          <label>To</label>
          <input
            id="filter-to"
            value="${escapeAttr(state.filters.to)}"
            placeholder="Where are you going?">
        </div>
      </div>

      <div class="ride-toolbar section-gap">
        ${["All", "Car", "Bike", "Rickshaw"].map(v => `
          <button
            class="filter-chip ${state.filters.vehicle === v ? "active" : ""}"
            data-vehicle-filter="${v}">
            ${v}
          </button>
        `).join("")}

        <button
          class="filter-chip ${state.filters.femaleOnly ? "active" : ""}"
          data-female-filter>
          ♡ Female-only
        </button>
      </div>

      <div id="ride-result-count" class="muted" style="font-size:11px">
        Loading shared rides…
      </div>
    </div>

    <div class="ride-cards section-gap" id="ride-cards">
      <div class="panel empty-state">Loading rides from server…</div>
    </div>
  `;
}

// ======================================
// ESCAPE HTML
// ======================================

function escapeAttr(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// ======================================
// FORMAT MONEY
// ======================================

function money(value) {
  return Number(value || 0).toFixed(2);
}

// ======================================
// BANGLADESH DATE & TIME
// ======================================

function getBangladeshToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function makeBangladeshDateTime(date, time) {
  return `${date}T${time}:00+06:00`;
}

// ======================================
// MAP BACKEND RIDE
// ======================================

function mapRide(r) {
  const d = new Date(r.departure_at);

  const totalPassengers = Number(
    r.total_passengers || (r.seats_total + 1)
  );

  return {
    id: Number(r.id),
    driver: r.driver_name || "Student",

    initials: (r.driver_name || "S")
      .split(/\s+/)
      .map(x => x[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),

    from: r.from_location,
    to: r.to_location,

    time: d.toLocaleTimeString("en-BD", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Dhaka"
    }),

    date: d.toLocaleDateString("en-BD", {
      timeZone: "Asia/Dhaka"
    }),

    seats: Number(r.seats_available ?? r.seats_total),
    vehicle: r.vehicle,

    fare: r.total_fare > 0
      ? Number(r.total_fare) / totalPassengers
      : Number(r.fare_per_person),

    totalFare: Number(r.total_fare || 0),
    totalPassengers,
    rating: 5,
    femaleOnly: Boolean(r.female_only),
    ownerId: Number(r.owner_id),
    requests: Number(r.pending_requests || 0),
    raw: r
  };
}

// ======================================
// RIDE CARD
// ======================================

function card(r) {
  const currentUserId = Number(
    localStorage.getItem("campuspool_user_id")
  );

  const isOwner = r.ownerId === currentUserId;

  return `
    <article class="ride-card">

      <div class="ride-card-top">
        <div class="avatar">${escapeAttr(r.initials)}</div>

        <div class="person">
          <strong>${escapeAttr(r.driver)}</strong>
          <small>
            ★ ${r.rating}
            · ${escapeAttr(r.vehicle)}
            · ${r.seats} seats left
            · ${r.requests} pending request(s)
          </small>
        </div>

        ${
          r.femaleOnly
            ? '<span class="pill pink">Female-only</span>'
            : '<span class="pill">Campus account</span>'
        }
      </div>

      <div class="ride-card-route">
        <div class="route-point">
          <small>PICKUP · ${escapeAttr(r.time)}</small>
          <strong>${escapeAttr(r.from)}</strong>
        </div>

        <div class="route-point">
          <small>DESTINATION</small>
          <strong>${escapeAttr(r.to)}</strong>
        </div>
      </div>

      <div class="ride-card-bottom">
        <div>
          <strong>৳${money(r.totalFare)}</strong>
          <small>Total ride fare</small>
          <small>৳${money(r.fare)} per person</small>
          <small>${r.totalPassengers} people including creator</small>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">

          <button
            class="btn btn-secondary btn-small"
            data-ride-details="${r.id}">
            View Details
          </button>

          ${
            isOwner
              ? `
                <span class="pill">Your post</span>

                <button
                  class="btn btn-danger btn-small"
                  data-cancel-ride="${r.id}">
                  Cancel Ride
                </button>
              `
              : `
                <button
                  class="btn btn-primary btn-small"
                  data-join-ride="${r.id}"
                  ${r.seats <= 0 ? "disabled" : ""}>
                  Request seat →
                </button>
              `
          }

        </div>
      </div>

    </article>
  `;
}

// ======================================
// FILTER RIDES
// ======================================

function filtered() {
  const from = (state.filters.from || "").toLowerCase();
  const to = (state.filters.to || "").toLowerCase();

  return backendRides.filter(r =>
    (!from || r.from.toLowerCase().includes(from)) &&
    (!to || r.to.toLowerCase().includes(to)) &&
    (
      state.filters.vehicle === "All" ||
      r.vehicle === state.filters.vehicle
    ) &&
    (
      !state.filters.femaleOnly ||
      r.femaleOnly
    )
  );
}

// ======================================
// PAINT RIDES
// ======================================

function paint() {
  const el = document.querySelector("#ride-cards");
  if (!el) return;

  const rs = filtered();

  el.innerHTML = rs.length
    ? rs.map(card).join("")
    : `
      <div class="panel empty-state">
        <strong>No rides found</strong>
        No shared rides are available. Try changing your filters.
      </div>
    `;

  const count = document.querySelector("#ride-result-count");

  if (count) {
    count.textContent = `${rs.length} shared ride(s) available`;
  }
}

// ======================================
// FARE PREVIEW
// ======================================

function updateFarePreview() {
  const fareInput = document.querySelector("#total-fare");
  const partnerInput = document.querySelector("#partner-count");
  const output = document.querySelector("#fare-per-person");
  const formula = document.querySelector("#fare-formula");

  if (!fareInput || !partnerInput || !output) return;

  const totalFare = Number(fareInput.value);
  const partnerCount = Number(partnerInput.value);
  const totalPassengers = partnerCount + 1;

  if (!partnerCount) {
    output.textContent = "Select how many students you need";
    return;
  }

  fareInput.min = totalPassengers;
  fareInput.max = totalPassengers * 100;

  if (!fareInput.value) {
    output.textContent = "Enter total fare";

    if (formula) {
      formula.textContent =
        `Total fare ÷ ${totalPassengers} people (including you)`;
    }

    return;
  }

  if (
    !Number.isInteger(totalFare) ||
    totalFare < totalPassengers ||
    totalFare > totalPassengers * 100
  ) {
    output.textContent =
      `Enter ৳${totalPassengers}–৳${totalPassengers * 100}`;
    return;
  }

  output.textContent = `৳${money(totalFare / totalPassengers)}`;

  if (formula) {
    formula.textContent =
      `৳${totalFare} ÷ ${totalPassengers} people`;
  }
}

// ======================================
// BIND RIDE ACTIONS
// ======================================

export function bindRideActions() {
  const from = document.querySelector("#filter-from");
  const to = document.querySelector("#filter-to");

  if (from) {
    from.addEventListener("input", () => {
      state.filters.from = from.value;
      paint();
    });
  }

  if (to) {
    to.addEventListener("input", () => {
      state.filters.to = to.value;
      paint();
    });
  }

  const date = document.querySelector("#ride-date");

  if (date) {
    const today = getBangladeshToday();
    date.min = today;
    date.max = today;
    date.value = today;
  }

  const fareInput = document.querySelector("#total-fare");
  const partnerInput = document.querySelector("#partner-count");

  if (fareInput) {
    fareInput.addEventListener("input", updateFarePreview);
  }

  if (partnerInput) {
    partnerInput.addEventListener("change", updateFarePreview);
  }

  updateFarePreview();

  if (state.currentView === "find-rides") {
    loadRides().catch(e => toast(e.message));
  }
}

// ======================================
// LOAD RIDES FROM BACKEND
// ======================================

async function loadRides() {
  const params = new URLSearchParams({
    from: state.filters.from || "",
    to: state.filters.to || ""
  });

  const data = await apiFetch(`/rides?${params}`);

  backendRides = data.rides.map(mapRide);

  paint();
}

// ======================================
// CLICK EVENTS
// ======================================

document.addEventListener("click", async e => {

  // ======================================
  // CANCEL RIDE - OPEN CONFIRMATION
  // ======================================

  const cancelRide = e.target.closest("[data-cancel-ride]");

  if (cancelRide) {
    const rideId = Number(cancelRide.dataset.cancelRide);

    const ride = backendRides.find(
      x => x.id === rideId
    );

    if (!ride) return;

    openModal(`
      <span class="pill">CANCEL RIDE</span>

      <h2 style="font-family:Space Grotesk;margin:16px 0 8px">
        Are you sure?
      </h2>

      <p class="muted">
        You are about to cancel your ride.
      </p>

      <p>
        <strong>${escapeAttr(ride.from)}</strong>
        →
        <strong>${escapeAttr(ride.to)}</strong>
      </p>

      <p class="field-hint">
        All students who requested or confirmed a seat
        will have their booking cancelled and receive a notification.
      </p>

      <div style="display:flex;gap:8px;margin-top:20px">

        <button
          class="btn btn-danger"
          id="confirm-cancel-ride"
          data-ride-id="${ride.id}">
          Yes, Cancel Ride
        </button>

        <button
          class="btn btn-secondary"
          id="close-cancel-modal">
          Keep Ride
        </button>

      </div>
    `);

    return;
  }

  // ======================================
  // CONFIRM RIDE CANCELLATION
  // ======================================

  const confirmCancel = e.target.closest("#confirm-cancel-ride");

  if (confirmCancel) {
    const rideId = Number(confirmCancel.dataset.rideId);

    try {
      confirmCancel.disabled = true;
      confirmCancel.textContent = "Cancelling...";

      await apiFetch(`/rides/${rideId}/cancel`, {
        method: "PATCH"
      });

      document.querySelector("#modal")?.close();

      toast("Ride cancelled successfully.");

      await loadRides();

    } catch (err) {
      toast(err.message);

      confirmCancel.disabled = false;
      confirmCancel.textContent = "Yes, Cancel Ride";
    }

    return;
  }

  // ======================================
  // CLOSE CANCEL MODAL
  // ======================================

  if (e.target.closest("#close-cancel-modal")) {
    document.querySelector("#modal")?.close();
    return;
  }

  // ======================================
  // VIEW RIDE DETAILS
  // ======================================

  const details = e.target.closest("[data-ride-details]");

  if (details) {
    state.selectedRideId = Number(details.dataset.rideDetails);
    navigate("ride-details");
    return;
  }

  // ======================================
  // VEHICLE FILTER
  // ======================================

  const vf = e.target.closest("[data-vehicle-filter]");

  if (vf) {
    state.filters.vehicle = vf.dataset.vehicleFilter;
    navigate("find-rides");
    return;
  }

  // ======================================
  // FEMALE-ONLY FILTER
  // ======================================

  if (e.target.closest("[data-female-filter]")) {
    state.filters.femaleOnly = !state.filters.femaleOnly;
    navigate("find-rides");
    return;
  }

  // ======================================
  // REQUEST SEAT
  // ======================================

  const join = e.target.closest("[data-join-ride]");

  if (join) {
    const ride = backendRides.find(
      x => x.id === Number(join.dataset.joinRide)
    );

    if (!ride) return;

    if (ride.seats <= 0) {
      toast("No seats available.");
      return;
    }

    openModal(`
      <span class="pill">BOOKING REQUEST</span>

      <h2 style="font-family:Space Grotesk;margin:16px 0 8px">
        Request a seat with ${escapeAttr(ride.driver)}
      </h2>

      <p class="muted">
        Route: ${escapeAttr(ride.from)} → ${escapeAttr(ride.to)}
      </p>

      <p>
        Total people including creator:
        <strong>${ride.totalPassengers}</strong>
      </p>

      <p>
        Total ride fare:
        <strong>৳${money(ride.totalFare)}</strong>
      </p>

      <p>
        Your estimated share:
        <strong class="text-green">৳${money(ride.fare)}</strong>
      </p>

      <button class="btn btn-primary"
        id="confirm-join"
        data-ride-id="${ride.id}">
        Confirm request
      </button>
    `);

    return;
  }

  // ======================================
  // CONFIRM BOOKING REQUEST
  // ======================================

  const confirm = e.target.closest("#confirm-join");

  if (confirm) {
    try {
      await apiFetch(
        `/rides/${Number(confirm.dataset.rideId)}/bookings`,
        {
          method: "POST",
          body: JSON.stringify({ seats: 1 })
        }
      );

      document.querySelector("#modal")?.close();

      toast("Booking request saved on the server.");
      navigate("bookings");

    } catch (err) {
      toast(err.message);
    }
  }
});

// ======================================
// POST RIDE FORM SUBMISSION
// ======================================

document.addEventListener("submit", async e => {
  if (e.target.id !== "post-ride-form") return;

  e.preventDefault();

  const form = e.target;
  const f = new FormData(form);

  const chosen = String(f.get("date") || "");
  const time = String(f.get("time") || "");
  const today = getBangladeshToday();

  if (chosen !== today) {
    toast("Rides can only be posted for today.");
    return;
  }

  const partnerCount = Number(f.get("partnerCount"));
  const totalPassengers = partnerCount + 1;
  const totalFare = Number(f.get("totalFare"));

  if (
    !Number.isInteger(partnerCount) ||
    partnerCount < 1 ||
    partnerCount > 3
  ) {
    toast("Select 1 to 3 other students.");
    return;
  }

  if (
    !Number.isInteger(totalFare) ||
    totalFare < totalPassengers ||
    totalFare > totalPassengers * 100
  ) {
    toast(
      `Total fare must be between ৳${totalPassengers} and ৳${totalPassengers * 100}.`
    );
    return;
  }

  if (!time) {
    toast("Please select departure time.");
    return;
  }

  const departureAt = makeBangladeshDateTime(chosen, time);
  const departureDate = new Date(departureAt);

  if (Number.isNaN(departureDate.getTime())) {
    toast("Invalid departure date or time.");
    return;
  }

  if (departureDate.getTime() <= Date.now()) {
    toast("Departure time must be in the future. Select a later time.");
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');

  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Publishing...";
    }

    await apiFetch("/rides", {
      method: "POST",
      body: JSON.stringify({
        from: f.get("from"),
        to: f.get("to"),
        departureAt,
        vehicle: f.get("vehicle"),
        totalFare,
        totalPassengers,
        femaleOnly: f.get("femaleOnly") === "on"
      })
    });

    toast("Ride published to the shared database.");

    state.filters.from = "";
    state.filters.to = "";

    navigate("find-rides");

  } catch (err) {
    toast(err.message);

  } finally {
    if (submitButton && submitButton.isConnected) {
      submitButton.disabled = false;
      submitButton.textContent = "＋ Publish ride";
    }
  }
});

