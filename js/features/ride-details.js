
import { state } from "../state.js";
import { apiFetch } from "../api.js";
import {
  toast,
  navigate,
  openStudentProfile
} from "../app.js";

// ======================================
// HELPERS
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

function money(value) {
  return Number(value || 0).toFixed(2);
}

// ======================================
// TRACKING STATE
// ======================================

const locationWatchers = new Map();
const locationPollers = new Map();
const lastLocationSent = new Map();
const locationSending = new Set();

function getLocationCard(bookingId) {
  return document.querySelector(
    `[data-live-card="${Number(bookingId)}"]`
  );
}

function stopLocalLocationTracking(bookingId) {
  const id = Number(bookingId);

  if (locationWatchers.has(id)) {
    navigator.geolocation.clearWatch(
      locationWatchers.get(id)
    );

    locationWatchers.delete(id);
  }

  if (locationPollers.has(id)) {
    clearInterval(locationPollers.get(id));
    locationPollers.delete(id);
  }

  lastLocationSent.delete(id);
  locationSending.delete(id);
}

function stopAllLocalTracking() {
  for (const id of [...locationWatchers.keys()]) {
    stopLocalLocationTracking(id);
  }

  for (const timer of locationPollers.values()) {
    clearInterval(timer);
  }

  locationPollers.clear();
}

// ======================================
// RENDER PAGE
// ======================================

export function renderRideDetails() {
  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow">CAMPUSPOOL RIDE INFORMATION</div>
        <h1>Ride Details</h1>
        <p>Review the journey and ride creator information.</p>
      </div>

      <button class="btn btn-secondary" data-view="find-rides">
        ← Back to rides
      </button>
    </div>

    <div id="ride-details-content">
      <div class="panel empty-state">
        Loading ride details...
      </div>
    </div>
  `;
}

// ======================================
// LIVE LOCATION CARD
// ======================================

function renderLocationCard(booking, isOwner) {
  const bookingId = Number(booking.id);

  const otherName = isOwner
    ? booking.passenger_name || "Passenger"
    : booking.driver_name || "Ride Owner";

  return `
    <div
      class="panel section-gap"
      data-live-card="${bookingId}"
    >
      <div class="panel-head">
        <div>
          <span class="pill">CONFIRMED BOOKING</span>
          <h2>Live Location Sharing</h2>
        </div>

        <span class="pill amber" id="live-status-${bookingId}">
          CHECKING
        </span>
      </div>

      <div class="panel-body">

        <p>
          <strong>Other participant:</strong>
          ${esc(otherName)}
        </p>

        <div class="divider section-gap"></div>

        <p id="my-location-status-${bookingId}">
          Checking your sharing status...
        </p>

        <div class="tracking-actions">
          <button
            class="btn btn-primary"
            data-start-location="${bookingId}"
          >
            Start Sharing Location
          </button>

          <button
            class="btn btn-danger"
            data-stop-location="${bookingId}"
            disabled
          >
            Stop Sharing
          </button>
        </div>

        <div class="divider section-gap"></div>

        <h3>Other Participant's Location</h3>

        <p id="other-location-${bookingId}">
          Waiting for location...
        </p>

        <a
          id="other-map-${bookingId}"
          href="#"
          target="_blank"
          rel="noopener noreferrer"
          style="display:none;"
        >
          Open Location in Google Maps →
        </a>

        <p class="field-hint">
          Location sharing is voluntary. Only confirmed
          participants in this booking can access it.
          Stop sharing whenever you want.
        </p>

      </div>
    </div>
  `;
}

// ======================================
// REFRESH LOCATION STATUS
// ======================================

async function refreshLocationStatus(bookingId) {
  const id = Number(bookingId);
  const card = getLocationCard(id);

  if (!card) return;

  try {
    const data = await apiFetch(
      `/bookings/${id}/location`
    );

    if (!card.isConnected) return;

    const status = card.querySelector(
      `#live-status-${id}`
    );

    const myStatus = card.querySelector(
      `#my-location-status-${id}`
    );

    const startButton = card.querySelector(
      `[data-start-location="${id}"]`
    );

    const stopButton = card.querySelector(
      `[data-stop-location="${id}"]`
    );

    // ==================================
    // MY SHARING STATUS
    // ==================================

    if (data.my_sharing) {
      if (status) {
        status.textContent = "SHARING ACTIVE";
        status.className = "pill green";
      }

      if (myStatus) {
        myStatus.textContent =
          "Your location sharing is active.";
      }

      if (startButton) {
        startButton.disabled = true;
        startButton.textContent = "Sharing Active";
      }

      if (stopButton) {
        stopButton.disabled = false;
      }

    } else {
      if (status) {
        status.textContent = "NOT SHARING";
        status.className = "pill amber";
      }

      if (myStatus) {
        myStatus.textContent =
          "You are not sharing your location.";
      }

      if (startButton) {
        startButton.disabled = false;
        startButton.textContent = "Start Sharing Location";
      }

      if (stopButton) {
        stopButton.disabled = true;
      }
    }

    // ==================================
    // OTHER PARTICIPANT LOCATION
    // ==================================

    const otherText = card.querySelector(
      `#other-location-${id}`
    );

    const mapLink = card.querySelector(
      `#other-map-${id}`
    );

    if (data.other_location) {
      const loc = data.other_location;

      const latitude = Number(loc.latitude);
      const longitude = Number(loc.longitude);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new Error("Invalid location received.");
      }

      if (otherText) {
        otherText.textContent =
          `Latitude: ${latitude.toFixed(5)}, ` +
          `Longitude: ${longitude.toFixed(5)}`;
      }

      if (mapLink) {
        mapLink.href =
          `https://www.google.com/maps?q=${latitude},${longitude}`;

        mapLink.style.display = "inline-block";
      }

    } else {
      if (otherText) {
        otherText.textContent =
          "The other participant has not shared a recent location.";
      }

      if (mapLink) {
        mapLink.style.display = "none";
        mapLink.removeAttribute("href");
      }
    }

  } catch (error) {
    const otherText = card.querySelector(
      `#other-location-${id}`
    );

    if (otherText) {
      otherText.textContent = error.message;
    }
  }
}

// ======================================
// POLL OTHER PARTICIPANT
// ======================================

function startLocationPolling(bookingId) {
  const id = Number(bookingId);

  if (locationPollers.has(id)) {
    clearInterval(locationPollers.get(id));
  }

  const timer = setInterval(() => {
    if (!getLocationCard(id)) {
      clearInterval(timer);
      locationPollers.delete(id);
      return;
    }

    refreshLocationStatus(id);
  }, 5000);

  locationPollers.set(id, timer);
}

// ======================================
// SEND GPS LOCATION
// ======================================

async function sendLocation(bookingId, position) {
  const id = Number(bookingId);

  if (locationSending.has(id)) return;

  const now = Date.now();
  const lastSent = lastLocationSent.get(id) || 0;

  if (now - lastSent < 5000) return;

  locationSending.add(id);

  try {
    await apiFetch(`/bookings/${id}/location`, {
      method: "PUT",
      body: JSON.stringify({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      })
    });

    lastLocationSent.set(id, now);

  } catch (error) {
    toast(error.message);
    stopLocalLocationTracking(id);

  } finally {
    locationSending.delete(id);
  }
}

// ======================================
// START LOCATION SHARING
// ======================================

async function startLocationSharing(bookingId) {
  const id = Number(bookingId);

  if (!navigator.geolocation) {
    toast("Your browser does not support GPS location.");
    return;
  }

  if (locationWatchers.has(id)) return;

  const card = getLocationCard(id);

  if (!card) return;

  const startButton = card.querySelector(
    `[data-start-location="${id}"]`
  );

  if (startButton) {
    startButton.disabled = true;
    startButton.textContent = "Requesting GPS...";
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000
        }
      );
    });

    // Send initial location to backend
    await apiFetch(`/bookings/${id}/location`, {
      method: "PUT",
      body: JSON.stringify({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      })
    });

    lastLocationSent.set(id, Date.now());

    // Watch GPS continuously
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        if (!getLocationCard(id)) {
          stopLocalLocationTracking(id);
          return;
        }

        sendLocation(id, pos);
      },

      error => {
        toast("GPS error: " + error.message);
        stopLocalLocationTracking(id);
      },

      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      }
    );

    locationWatchers.set(id, watchId);

    await refreshLocationStatus(id);

    toast("Live location sharing started.");

  } catch (error) {
    toast(error.message || "Could not start location sharing.");

    if (startButton) {
      startButton.disabled = false;
      startButton.textContent = "Start Sharing Location";
    }
  }
}

// ======================================
// STOP LOCATION SHARING
// ======================================

async function stopLocationSharing(bookingId) {
  const id = Number(bookingId);

  stopLocalLocationTracking(id);

  try {
    await apiFetch(`/bookings/${id}/location`, {
      method: "DELETE"
    });

    await refreshLocationStatus(id);

    toast("Live location sharing stopped.");

  } catch (error) {
    toast(error.message);
  }
}

// ======================================
// LOAD RIDE DETAILS
// ======================================

export async function loadRideDetails() {
  stopAllLocalTracking();

  const el = document.querySelector(
    "#ride-details-content"
  );

  if (!el) return;

  try {
    const rideId = Number(state.selectedRideId);

    if (!rideId) {
      el.innerHTML = `
        <div class="panel empty-state">
          <strong>Ride not selected</strong>
          Please go back and select a ride.
        </div>
      `;
      return;
    }

    const [data, bookingsData] = await Promise.all([
      apiFetch("/rides"),
      apiFetch("/bookings")
    ]);

    const ride = (data.rides || []).find(
      r => Number(r.id) === rideId
    );

    if (!ride) {
      el.innerHTML = `
        <div class="panel empty-state">
          <strong>Ride not found</strong>
          This ride may no longer be available.
        </div>
      `;
      return;
    }

    const allBookings = bookingsData.bookings || [];

    const departure = new Date(ride.departure_at);

    const dateText = departure.toLocaleDateString("en-BD", {
      timeZone: "Asia/Dhaka",
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    const timeText = departure.toLocaleTimeString("en-BD", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      minute: "2-digit"
    });

    const totalPassengers = Number(
      ride.total_passengers || 2
    );

    const totalFare = Number(
      ride.total_fare || 0
    );

    const farePerPerson = Number(
      ride.fare_per_person || totalFare / totalPassengers
    );

    const seatsAvailable = Number(
      ride.seats_available ?? ride.seats_total ?? 0
    );

    const currentUserId = Number(
      localStorage.getItem("campuspool_user_id")
    );

    const isOwner =
      Number(ride.owner_id) === currentUserId;

    const creatorName = ride.driver_name || "Student";

    const creatorInitials = creatorName
      .split(/\s+/)
      .map(x => x[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

    const studentId =
      ride.driver_student_id || "Not available";

    const department =
      ride.driver_department || "Not available";

    const canRequest =
      !isOwner &&
      seatsAvailable > 0 &&
      ride.status === "open";

    const confirmedBookings = allBookings.filter(b =>
      Number(b.ride_id) === rideId &&
      b.status === "confirmed" &&
      (
        isOwner ||
        Number(b.passenger_id) === currentUserId
      )
    );

    const chatButtons = confirmedBookings.length
      ? confirmedBookings.map(b => `
          <button
            class="btn btn-primary chat-booking-btn"
            data-chat-booking="${Number(b.id)}">
            Open Private Chat →
          </button>
        `).join("")
      : "";

    const locationCards = confirmedBookings.map(b =>
      renderLocationCard(b, isOwner)
    ).join("");

    el.innerHTML = `
      <div class="grid grid-2">

        <section class="panel">
          <div class="panel-head">
            <div>
              <span class="pill">RIDE ROUTE</span>
              <h2>Journey Information</h2>
            </div>
          </div>

          <div class="panel-body">
            <div class="route-point">
              <small>PICKUP LOCATION</small>
              <h2>${esc(ride.from_location)}</h2>
            </div>

            <div class="route-point section-gap">
              <small>DESTINATION</small>
              <h2>${esc(ride.to_location)}</h2>
            </div>

            <div class="divider section-gap"></div>

            <p>
              <strong>Departure date:</strong>
              ${esc(dateText)}
            </p>

            <p>
              <strong>Departure time:</strong>
              ${esc(timeText)}
            </p>

            <p>
              <strong>Vehicle:</strong>
              ${esc(ride.vehicle)}
            </p>

            <p>
              <strong>Female-only:</strong>
              ${ride.female_only ? "Yes" : "No"}
            </p>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <span class="pill">FARE & PASSENGERS</span>
              <h2>Ride Summary</h2>
            </div>
          </div>

          <div class="panel-body">
            <p>Total ride fare</p>
            <h1>৳${money(totalFare)}</h1>

            <div class="divider section-gap"></div>

            <p>
              <strong>Fare per person:</strong>
              ৳${money(farePerPerson)}
            </p>

            <p>
              <strong>Total people:</strong>
              ${totalPassengers} (including creator)
            </p>

            <p>
              <strong>Available seats:</strong>
              ${seatsAvailable}
            </p>

            <p>
              <strong>Ride status:</strong>
              ${esc(ride.status || "Open")}
            </p>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <span class="pill">RIDE CREATOR</span>
              <h2>Student Profile</h2>
            </div>
          </div>

          <div class="panel-body">
            <div class="avatar">
              ${esc(creatorInitials)}
            </div>

            <h2>${esc(creatorName)}</h2>
            <p class="muted">Ride Creator</p>

            <div class="divider section-gap"></div>

            <p>
              <strong>Student ID:</strong>
              ${esc(studentId)}
            </p>

            <p>
              <strong>Department:</strong>
              ${esc(department)}
            </p>

            <button
              class="btn btn-secondary"
              id="view-ride-creator-profile"
              data-user-id="${Number(ride.owner_id)}">
              View Full Profile →
            </button>

            ${
              isOwner
                ? `<p class="field-hint">This is your ride.</p>`
                : `<p class="field-hint">Review the student information before requesting a seat.</p>`
            }
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <span class="pill">NEXT STEP</span>
              <h2>Booking Request</h2>
            </div>
          </div>

          <div class="panel-body">
            ${
              isOwner
                ? `
                  <p>You created this ride.</p>
                  <p>Manage incoming requests from My Activities.</p>
                  <button class="btn btn-primary" data-view="activities">
                    My Activities
                  </button>
                `
                : canRequest
                  ? `
                    <p>You can request one seat on this ride.</p>
                    <p>Your estimated fare:
                      <strong>৳${money(farePerPerson)}</strong>
                    </p>
                    <button
                      class="btn btn-primary"
                      id="request-this-ride"
                      data-ride-id="${Number(ride.id)}">
                      Request This Ride →
                    </button>
                    <p class="field-hint">
                      Your request will remain pending until the ride creator responds.
                    </p>
                  `
                  : `
                    <p>This ride is currently unavailable for booking.</p>
                    <button class="btn btn-secondary" data-view="find-rides">
                      Find another ride
                    </button>
                  `
            }
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <span class="pill">PRIVATE MESSAGES</span>
              <h2>Ride Chat</h2>
            </div>
          </div>

          <div class="panel-body">
            ${
              confirmedBookings.length
                ? `
                  <p>Your booking is confirmed. You can now chat privately.</p>
                  ${chatButtons}
                `
                : `
                  <p class="field-hint">
                    Private chat will become available after your booking is accepted.
                  </p>
                `
            }
          </div>
        </section>

      </div>

      ${
        confirmedBookings.length
          ? `
            <section class="section-gap">
              <div class="page-heading">
                <div>
                  <div class="eyebrow">SAFETY THROUGH SHARED LOCATION</div>
                  <h2>Live Location Sharing</h2>
                  <p>
                    Share your GPS location with confirmed ride participants.
                  </p>
                </div>
              </div>

              ${locationCards}
            </section>
          `
          : ""
      }
    `;

    // Refresh location and start polling
    for (const booking of confirmedBookings) {
      const bookingId = Number(booking.id);

      refreshLocationStatus(bookingId);

      startLocationPolling(bookingId);
    }

  } catch (error) {
    el.innerHTML = `
      <div class="panel empty-state">
        <strong>Could not load ride details</strong>
        ${esc(error.message)}
      </div>
    `;
  }
}

// ======================================
// CLICK EVENTS
// ======================================

document.addEventListener("click", async e => {

  // VIEW STUDENT PROFILE
  const profileButton = e.target.closest(
    "#view-ride-creator-profile"
  );

  if (profileButton) {
    const userId = Number(
      profileButton.dataset.userId
    );

    if (!userId) {
      toast("Student profile not found.");
      return;
    }

    openStudentProfile(userId);
    return;
  }

  // REQUEST RIDE
  const requestButton = e.target.closest(
    "#request-this-ride"
  );

  if (requestButton) {
    const rideId = Number(
      requestButton.dataset.rideId
    );

    if (!rideId) {
      toast("Invalid ride.");
      return;
    }

    try {
      requestButton.disabled = true;
      requestButton.textContent = "Sending request...";

      await apiFetch(`/rides/${rideId}/bookings`, {
        method: "POST",
        body: JSON.stringify({ seats: 1 })
      });

      toast("Booking request sent successfully.");

      navigate("bookings");

    } catch (error) {
      toast(error.message);

      requestButton.disabled = false;
      requestButton.textContent = "Request This Ride →";
    }

    return;
  }

  // OPEN PRIVATE CHAT
  const chatButton = e.target.closest(
    "[data-chat-booking]"
  );

  if (chatButton) {
    const bookingId = Number(
      chatButton.dataset.chatBooking
    );

    if (!bookingId) {
      toast("Invalid booking.");
      return;
    }

    state.selectedChatBookingId = bookingId;

    navigate("chat");
    return;
  }

  // START LOCATION SHARING
  const startButton = e.target.closest(
    "[data-start-location]"
  );

  if (startButton) {
    await startLocationSharing(
      Number(startButton.dataset.startLocation)
    );

    return;
  }

  // STOP LOCATION SHARING
  const stopButton = e.target.closest(
    "[data-stop-location]"
  );

  if (stopButton) {
    await stopLocationSharing(
      Number(stopButton.dataset.stopLocation)
    );

    return;
  }

});
