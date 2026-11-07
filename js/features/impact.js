import { apiFetch } from "../api.js";

export function renderImpact() {
  // পেজ লোড হলে সার্ভার থেকে আসল ডাটা নিয়ে আসবে
  setTimeout(loadRealImpact, 0);

  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow">SMALL RIDES, BIG IMPACT</div>
        <h1>Your impact <span class="text-green">✳</span></h1>
        <p>See the estimated money and emissions saved by sharing rides.</p>
      </div>
      <span class="pill">FEATURE 13</span>
    </div>

    <section class="impact-hero">
      <div>
        <span class="pill">YOUR CAMPUS FOOTPRINT</span>
        <h2>Better together.<br><span>Every seat counts.</span></h2>
        <p>Shared rides can reduce the number of separate journeys. These figures are based on your real confirmed bookings.</p>
      </div>
      <div class="impact-leaf">✳<small>MOVE SMARTER</small></div>
    </section>

    <div class="grid grid-4 section-gap">
      <!-- Estimated Savings -->
      <article class="stat-card">
        <div class="stat-top">Estimated savings <span class="stat-icon">৳</span></div>
        <div class="stat-value" id="impact-savings">—</div>
        <div class="stat-foot">Based on your confirmed rides</div>
      </article>

      <!-- CO2 Avoided -->
      <article class="stat-card">
        <div class="stat-top">CO₂ avoided <span class="stat-icon">♧</span></div>
        <div class="stat-value" id="impact-co2">— kg</div>
        <div class="stat-foot">Estimated reduction</div>
      </article>

      <!-- Shared Trips -->
      <article class="stat-card">
        <div class="stat-top">Shared trips <span class="stat-icon">↗</span></div>
        <div class="stat-value" id="impact-trips">—</div>
        <div class="stat-foot">Your confirmed bookings</div>
      </article>

      <!-- Seats Shared -->
      <article class="stat-card">
        <div class="stat-top">Seats shared <span class="stat-icon">♧</span></div>
        <div class="stat-value" id="impact-seats">—</div>
        <div class="stat-foot">Total seats booked</div>
      </article>
    </div>

    <div class="grid grid-2 section-gap">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>How the estimate works</h2>
            <p>Transparent assumptions</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="impact-assumption">
            <span>Estimated alternative trip cost</span>
            <strong>৳30 / person</strong>
          </div>
          <div class="impact-assumption">
            <span>CO₂ factor</span>
            <strong>2.5 kg / shared trip</strong>
          </div>
          <div class="impact-assumption">
            <span>Trips counted</span>
            <strong id="impact-trips-math">—</strong>
          </div>
          <p class="field-hint">These are estimates based on your confirmed bookings, not measured environmental results.</p>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Ways to increase your impact</h2>
            <p>Simple actions that add up</p>
          </div>
        </div>
        <div class="panel-body impact-tips">
          <div>
            <i>01</i>
            <span>
              <strong>Share your regular commute</strong>
              <small>Post recurring rides when your schedule is predictable.</small>
            </span>
          </div>
          <div>
            <i>02</i>
            <span>
              <strong>Choose a reasonable detour</strong>
              <small>Keep pickup routes efficient for everyone.</small>
            </span>
          </div>
          <div>
            <i>03</i>
            <span>
              <strong>Confirm trip details early</strong>
              <small>Reduce missed pickups and unnecessary waiting.</small>
            </span>
          </div>
        </div>
      </section>
    </div>
  `;
}

async function loadRealImpact() {
  try {
    // সার্ভার থেকে আসল ডাটা আনা
    const data = await apiFetch("/user/impact");

    // DOM আপডেট করা
    const savingsEl = document.querySelector("#impact-savings");
    const co2El = document.querySelector("#impact-co2");
    const tripsEl = document.querySelector("#impact-trips");
    const seatsEl = document.querySelector("#impact-seats");
    const tripsMathEl = document.querySelector("#impact-trips-math");

    if (savingsEl) savingsEl.textContent = `৳${data.savings}`;
    if (co2El) co2El.textContent = `${data.co2} kg`;
    if (tripsEl) tripsEl.textContent = data.trips;
    if (seatsEl) seatsEl.textContent = data.seats;
    if (tripsMathEl) tripsMathEl.textContent = data.trips;

  } catch (error) {
    console.error("Failed to load impact data", error);
  }
}