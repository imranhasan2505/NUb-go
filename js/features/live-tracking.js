import { apiFetch } from "../api.js";
import { toast } from "../app.js";

let lastLocation = null;
let sosTimer = null;
let sosProgressTimer = null;
let holdStarted = false;
let sendingSOS = false;

const HOLD_DURATION = 3000;

export function renderLiveTracking() {
  return `
    <style>
      /* =================================
         COLORFUL PREMIUM SOS DESIGN
      ================================= */

      .sos-glass-section {
        width: 100%;
        max-width: 520px;
        margin: 30px auto 0;
        padding: 20px;
        border-radius: 28px;
        background: linear-gradient(
          135deg,
          rgba(255,235,235,.95),
          rgba(255,245,230,.95),
          rgba(245,235,255,.95)
        );
        border: 1px solid rgba(255,255,255,.9);
        box-shadow: 0 15px 40px rgba(120,40,80,.12);
      }

      .sos-glass-button {
        position: relative;
        isolation: isolate;
        overflow: hidden;

        width: 100%;
        min-height: 112px;
        padding: 20px;

        display: flex;
        align-items: center;
        justify-content: center;
        gap: 20px;

        border: 2px solid rgba(255,255,255,.75);
        border-radius: 25px;

        background: linear-gradient(
          120deg,
          #ff1744,
          #ff3d00,
          #e91e63,
          #9c27b0
        );
        background-size: 250% 250%;

        color: white;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        touch-action: none;

        box-shadow:
          0 10px 25px rgba(255,23,68,.35),
          inset 0 2px 8px rgba(255,255,255,.3);

        transition: transform .2s ease;
        animation: sos-gradient 5s ease infinite;
      }

      .sos-glass-button::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -1;
        background: linear-gradient(
          120deg,
          transparent 20%,
          rgba(255,255,255,.3) 50%,
          transparent 80%
        );
        transform: translateX(-100%);
        transition: transform .6s ease;
      }

      .sos-glass-button:hover::before {
        transform: translateX(100%);
      }

      .sos-glass-button:active {
        transform: scale(.97);
      }

      .sos-glass-button:disabled {
        opacity: .7;
        cursor: not-allowed;
      }

      .sos-glass-icon {
        font-size: 43px;
        filter: drop-shadow(0 3px 8px rgba(0,0,0,.25));
      }

      .sos-glass-content {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 7px;
      }

      .sos-glass-content strong {
        font-size: 23px;
        font-weight: 850;
        color: #fff;
        letter-spacing: .4px;
        text-shadow: 0 2px 5px rgba(0,0,0,.2);
      }

      .sos-glass-content small {
        font-size: 14px;
        color: rgba(255,255,255,.95);
        font-weight: 600;
      }

      .sos-glass-button.is-holding {
        animation: sos-pulse .65s infinite alternate;
        box-shadow:
          0 0 15px #ff1744,
          0 0 35px rgba(255,23,68,.7),
          0 0 55px rgba(156,39,176,.4);
        border-color: white;
      }

      @keyframes sos-gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }

      @keyframes sos-pulse {
        from {
          transform: scale(1);
          filter: brightness(1);
        }
        to {
          transform: scale(1.025);
          filter: brightness(1.2);
        }
      }

      /* COLORFUL PROGRESS BAR */

      .sos-progress-track {
        width: 90%;
        height: 12px;
        margin: 20px auto 12px;
        overflow: hidden;
        border-radius: 30px;
        background: linear-gradient(90deg,#ead5ff,#ffd5df);
        box-shadow: inset 0 2px 5px rgba(0,0,0,.12);
      }

      .sos-progress-fill {
        width: 0%;
        height: 100%;
        border-radius: 30px;

        background: linear-gradient(
          90deg,
          #ff1744,
          #ff9100,
          #ffea00,
          #e040fb
        );

        background-size: 200% 100%;
        box-shadow: 0 0 15px rgba(255,23,68,.6);
        transition: width .05s linear;
      }

      .sos-glass-section .field-hint {
        color: #66516f;
        font-weight: 500;
      }

      @media (max-width:480px) {
        .sos-glass-section {
          padding: 13px;
        }

        .sos-glass-button {
          min-height: 90px;
          gap: 13px;
          padding: 14px;
        }

        .sos-glass-icon {
          font-size: 34px;
        }

        .sos-glass-content strong {
          font-size: 19px;
        }
      }
    </style>

    <div class="page-heading">
      <div>
        <div class="eyebrow">SAFETY THROUGH SHARED LOCATION</div>
        <h1>Live trip tracking</h1>
        <p>Allow location access to preview your current position during a confirmed ride.</p>
      </div>
      <span class="pill amber">LOCATION PERMISSION REQUIRED</span>
    </div>

    <section class="panel tracking-panel">

      <div class="tracking-map">
        <div class="map-grid"></div>

        <svg viewBox="0 0 800 400" preserveAspectRatio="none">
          <path
            d="M90 330 C170 290,160 200,270 215 S430 300,500 195 S650 90,720 60"
            fill="none"
            stroke="#163d50"
            stroke-width="28"
          />

          <path
            d="M90 330 C170 290,160 200,270 215 S430 300,500 195 S650 90,720 60"
            fill="none"
            stroke="#19d5a0"
            stroke-width="6"
            stroke-linecap="round"
            stroke-dasharray="8 10"
          />
        </svg>

        <span class="track-pin start">A</span>
        <span class="track-pin end">B</span>
        <div class="vehicle-marker">📍</div>

        <div class="tracking-map-label" id="location-status">
          Location has not been shared
        </div>
      </div>

      <div class="tracking-details">

        <div class="tracking-person">
          <div class="avatar">GPS</div>
          <div>
            <strong>Live location tracking</strong>
            <small>Get your current location during your ride.</small>
          </div>
          <span class="pill amber">GPS</span>
        </div>

        <div class="grid grid-3 tracking-stats">
          <div>
            <small>Latitude</small>
            <strong id="gps-lat">—</strong>
          </div>

          <div>
            <small>Longitude</small>
            <strong id="gps-lon">—</strong>
          </div>

          <div>
            <small>Accuracy</small>
            <strong id="gps-accuracy">—</strong>
          </div>
        </div>

        <div class="tracking-actions">
          <button class="btn btn-primary" id="enable-live-location">
            Allow & get my location
          </button>

          <button class="btn btn-secondary" id="copy-location" disabled>
            Copy location link
          </button>
        </div>

        <!-- COLORFUL PREMIUM SOS -->

        <div class="sos-glass-section">

          <button
            id="send-sos"
            class="sos-glass-button"
            type="button"
          >
            <span class="sos-glass-icon">🚨</span>

            <span class="sos-glass-content">
              <strong id="sos-button-text">
                Emergency SOS
              </strong>

              <small id="sos-hold-status">
                Hold for 3 seconds
              </small>
            </span>
          </button>

          <div class="sos-progress-track">
            <div
              id="sos-progress-bar"
              class="sos-progress-fill"
            ></div>
          </div>

          <p class="field-hint" style="text-align:center;">
            Press and hold continuously for 3 seconds.
          </p>

        </div>

        <p class="field-hint">
          SOS alerts the other participant inside CampusPool.
          It does not contact police or emergency services.
        </p>

      </div>
    </section>
  `;
}

// RESET SOS HOLD

function cancelSOSHold() {
  if (sosTimer) clearTimeout(sosTimer);
  if (sosProgressTimer) clearInterval(sosProgressTimer);

  sosTimer = null;
  sosProgressTimer = null;
  holdStarted = false;

  const text = document.querySelector("#sos-button-text");
  const status = document.querySelector("#sos-hold-status");
  const progress = document.querySelector("#sos-progress-bar");
  const button = document.querySelector("#send-sos");

  if (progress) progress.style.width = "0%";
  if (button) button.classList.remove("is-holding");

  if (!sendingSOS && text) {
    text.textContent = "Emergency SOS";
  }

  if (!sendingSOS && status) {
    status.textContent = "Hold for 3 seconds";
  }
}

// SEND SOS TO BACKEND

async function sendSOS() {
  if (sendingSOS) return;

  sendingSOS = true;

  const button = document.querySelector("#send-sos");
  const text = document.querySelector("#sos-button-text");
  const status = document.querySelector("#sos-hold-status");
  const progress = document.querySelector("#sos-progress-bar");

  if (button) button.disabled = true;
  if (text) text.textContent = "Sending alert...";
  if (status) status.textContent = "Please wait...";

  try {
    const userId = Number(localStorage.getItem("campuspool_user_id"));
    let payload = {};

    if (lastLocation) {
      payload.latitude = lastLocation.latitude;
      payload.longitude = lastLocation.longitude;
    }

    const data = await apiFetch("/bookings");
    const booking = (data.bookings || []).find(b =>
      b.status === "confirmed" &&
      (Number(b.owner_id) === userId || Number(b.passenger_id) === userId)
    );

    if (booking) {
      // বুকিং থাকলে রাইড পার্টনারের কাছে যাবে
      payload.message = "Emergency! I need help (during ride).";
      await apiFetch(`/bookings/${Number(booking.id)}/sos`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      toast("SOS sent to your ride partner!");
    } else {
      // বুকিং না থাকলে ট্রাস্টেড কন্টাক্টদের কাছে যাবে
      payload.message = "EMERGENCY! I need help immediately. This is an automated SOS alert.";
      await apiFetch(`/sos/trigger`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      toast("SOS sent to your Trusted Contacts!");
    }

    if (text) text.textContent = "✓ SOS Alert Sent";
    if (status) status.textContent = "Emergency alert sent successfully.";
    if (progress) progress.style.width = "100%";

  } catch (err) {
    toast(err.message);

    if (text) text.textContent = "Emergency SOS";
    if (status) status.textContent = err.message;
    if (progress) progress.style.width = "0%";

  } finally {
    sendingSOS = false;

    if (button) button.disabled = false;
    if (button) button.classList.remove("is-holding");
  }
}

// GPS LOCATION AND COPY LOCATION

document.addEventListener("click", e => {

  if (e.target.closest("#enable-live-location")) {

    if (!navigator.geolocation) {
      toast("Geolocation is not supported.");
      return;
    }

    const status = document.querySelector("#location-status");

    if (status) {
      status.textContent = "Requesting location permission...";
    }

    navigator.geolocation.getCurrentPosition(
      pos => {

        lastLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        };

        document.querySelector("#gps-lat").textContent =
          lastLocation.latitude.toFixed(5);

        document.querySelector("#gps-lon").textContent =
          lastLocation.longitude.toFixed(5);

        document.querySelector("#gps-accuracy").textContent =
          `±${Math.round(pos.coords.accuracy)} m`;

        if (status) {
          status.textContent = "Your current location was read on this device";
        }

        const copy = document.querySelector("#copy-location");

        if (copy) copy.disabled = false;

        toast("Location permission granted.");
      },

      err => {
        if (status) {
          status.textContent = "Could not access location: " + err.message;
        }

        toast("Allow location access in your browser settings.");
      },

      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );
  }

  if (e.target.closest("#copy-location") && lastLocation) {

    const url =
      `https://maps.google.com/?q=${lastLocation.latitude},${lastLocation.longitude}`;

    navigator.clipboard?.writeText(url)
      .then(() => toast("Location link copied."))
      .catch(() => toast(url));
  }

});

// SOS PRESS AND HOLD FOR 3 SECONDS

document.addEventListener("pointerdown", e => {

  const button = e.target.closest("#send-sos");

  if (!button || sendingSOS || button.disabled) return;

  e.preventDefault();

  cancelSOSHold();

  holdStarted = true;

  const text = document.querySelector("#sos-button-text");
  const status = document.querySelector("#sos-hold-status");
  const progress = document.querySelector("#sos-progress-bar");

  const start = Date.now();

  button.classList.add("is-holding");

  if (text) text.textContent = "Keep holding... 3";
  if (status) status.textContent = "Do not release the button.";

  sosProgressTimer = setInterval(() => {

    if (!holdStarted) return;

    const elapsed = Date.now() - start;

    const remaining = Math.max(
      0,
      Math.ceil((HOLD_DURATION - elapsed) / 1000)
    );

    if (progress) {
      progress.style.width =
        `${Math.min(100, (elapsed / HOLD_DURATION) * 100)}%`;
    }

    if (text) {
      text.textContent = remaining > 0
        ? `Keep holding... ${remaining}`
        : "Sending SOS...";
    }

  }, 50);

  sosTimer = setTimeout(() => {

    if (!holdStarted) return;

    if (sosProgressTimer) clearInterval(sosProgressTimer);

    sosTimer = null;
    sosProgressTimer = null;
    holdStarted = false;

    if (progress) progress.style.width = "100%";

    sendSOS();

  }, HOLD_DURATION);

});

// RELEASE BEFORE 3 SECONDS = CANCEL

document.addEventListener("pointerup", () => {
  if (holdStarted) cancelSOSHold();
});

document.addEventListener("pointercancel", () => {
  if (holdStarted) cancelSOSHold();
});

document.addEventListener("contextmenu", e => {
  if (e.target.closest("#send-sos")) {
    e.preventDefault();
  }
});