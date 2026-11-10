import { state } from "../state.js";
import { toast, navigate } from "../app.js";
import { apiFetch, setSession } from "../api.js";

let authMode = "login";

export function renderAuth() {
  authMode = "login";

  return `
    <div class="auth-page" data-auth-mode="login">

      <div class="auth-brand">
        <div class="auth-brand-icon">CP</div>
        <div>
          <h2>CampusPool</h2>
          <span>Ride together, go further.</span>
        </div>
        <span class="auth-status">
          <i></i> SYSTEM ONLINE
        </span>
      </div>

      <div class="auth-layout">

        <!-- LEFT VISUAL PANEL -->

        <aside class="auth-visual">

          <div class="auth-visual-login">

            <div class="auth-visual-overlay"></div>

            <div class="auth-visual-content">
              <span class="auth-tag">WELCOME BACK TO CAMPUS</span>

              <h1>
                Your campus.<br>
                Your people.<br>
                <span>Your journey.</span>
              </h1>

              <p>
                Connect with fellow students, share your rides
                and make every journey easier.
              </p>

              <div class="auth-benefits">
                <div>
                  <span>✓</span>
                  Verified student community
                </div>
                <div>
                  <span>✓</span>
                  Affordable shared rides
                </div>
                <div>
                  <span>✓</span>
                  Safer campus journeys
                </div>
              </div>
            </div>

            <div class="auth-visual-footer">
              <span>ONE CAMPUS. MANY JOURNEYS.</span>
              <span>01 / 02</span>
            </div>

          </div>

          <div class="auth-visual-register">
            <div class="auth-register-art">
              <div class="auth-register-art-glow"></div>
              <div class="auth-register-art-caption">
                <span>SMART CAMPUS MOBILITY</span>
                <strong>Smarter Ride<br>Greener Campus</strong>
                <i></i>
              </div>
            </div>
          </div>

        </aside>

        <!-- RIGHT FORM PANEL -->

        <section class="auth-form-panel">

          <div class="auth-register-brand" aria-label="CampusPool">
            <span class="auth-register-brand-icon">◆</span>
            <span>
              <strong>CampusPool</strong>
              <small>Urban Campus Mobility</small>
            </span>
          </div>

          <div class="auth-form-top">
            <span class="auth-mobile-logo">CP</span>
            <span class="auth-top-label">CAMPUSPOOL ACCOUNT</span>
            <span class="pill green">BACKEND CONNECTED</span>
          </div>

          <div class="auth-form-inner">

            <div class="auth-heading">
              <div class="auth-emblem">↗</div>

              <span class="auth-eyebrow" id="auth-eyebrow">
                GOOD TO SEE YOU AGAIN
              </span>

              <h2 id="auth-title">Welcome Back!</h2>

              <p id="auth-description">
                Sign in to continue your campus journey.
              </p>
            </div>

            <div class="auth-tabs">
              <button
                type="button"
                class="active"
                id="auth-login-tab"
              >
                Sign In
              </button>

              <button
                type="button"
                id="auth-register-tab"
              >
                Create Account
              </button>
            </div>

            <form id="auth-form">

              <div class="field" id="auth-name-wrap" hidden>
                <label for="auth-name">Full Name</label>
                <input
                  id="auth-name"
                  type="text"
                  minlength="2"
                  placeholder="Enter your full name"
                  autocomplete="name"
                >
              </div>

              <div class="field">
                <label for="auth-identity">Student ID</label>

                <input
                  id="auth-identity"
                  type="text"
                  required
                  minlength="3"
                  placeholder="e.g. CSE-22104"
                  autocomplete="username"
                >
              </div>

              <!-- ডিপার্টমেন্ট ফিল্ড এখন লগইনেও দেখা যাবে -->
              <div class="field" id="auth-department-wrap">
                <label for="auth-department">Department</label>

                <select id="auth-department">
                  <option value="">Select your department</option>
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
                  ].map(d => `<option value="${d}">${d}</option>`).join("")}
                </select>
              </div>

              <!-- জেন্ডার ফিল্ড এখন লগইনেও দেখা যাবে -->
              <div class="field" id="auth-gender-wrap">
                <label for="auth-gender">Gender</label>

                <select id="auth-gender">
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              <div class="field">
                <label for="auth-password">Password</label>

                <input
                  id="auth-password"
                  type="password"
                  required
                  minlength="8"
                  placeholder="Enter your password"
                  autocomplete="current-password"
                >
              </div>

              <div class="field" id="auth-confirm-password-wrap" hidden>
                <label for="auth-confirm-password">Confirm Password</label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  minlength="8"
                  placeholder="Confirm your password"
                  autocomplete="new-password"
                >
              </div>

              <button
                class="btn btn-primary auth-submit"
                type="submit"
                id="auth-submit"
              >
                Sign In <span>→</span>
              </button>

              <p class="auth-message" id="auth-message">
                Don't have an account?
                <button type="button" data-auth-switch="register">
                  Create one
                </button>
              </p>

              <!-- Forgot Password বাটন -->
              <p style="text-align: center; margin-top: -10px; margin-bottom: 15px;">
                <button type="button" data-forgot-password style="background: none; border: none; color: #19d5a0; cursor: pointer; font-size: 13px; text-decoration: underline;">
                  Forgot Password?
                </button>
              </p>

            </form>

            <div class="auth-divider">
              <span>STUDENT COMMUNITY ACCESS</span>
            </div>

            <div class="auth-security">
              <span>🔒</span>
              <p>
                Your account information is securely handled
                by the CampusPool server.
              </p>
            </div>

          </div>

          <div class="auth-form-bottom">
            <span>© CampusPool</span>
            <span>Ride Together, Go Further.</span>
          </div>

        </section>

      </div>
    </div>
  `;
}

function applyMode(mode) {
  authMode = mode;

  const reg = mode === "register";
  const page = document.querySelector(".auth-page");

  if (!page) return;

  page.dataset.authMode = mode;

  document.querySelector("#auth-title").textContent =
    reg ? "Create Account" : "Welcome Back!";

  document.querySelector("#auth-eyebrow").textContent =
    reg ? "START YOUR CAMPUS JOURNEY" : "GOOD TO SEE YOU AGAIN";

  document.querySelector("#auth-description").textContent =
    reg
      ? "Join your campus community and travel smarter."
      : "Sign in to continue your campus journey.";

  document.querySelector("#auth-name-wrap").hidden = !reg;
  // লগইনেও ডিপার্টমেন্ট ও জেন্ডার দেখা যাবে
  document.querySelector("#auth-department-wrap").hidden = false;
  document.querySelector("#auth-gender-wrap").hidden = false;
  document.querySelector("#auth-confirm-password-wrap").hidden = !reg;
  document.querySelector("#auth-confirm-password").required = reg;

  document.querySelector("#auth-name").required = reg;
  // লগইনে ডিপার্টমেন্ট ও জেন্ডার বাধ্যতামূলক
  document.querySelector("#auth-department").required = true;
  document.querySelector("#auth-gender").required = true;

  document.querySelector("#auth-password").autocomplete =
    reg ? "new-password" : "current-password";

  document.querySelector("#auth-confirm-password").value = "";

  document.querySelector("#auth-submit").innerHTML =
    reg
      ? 'Create Account <span>→</span>'
      : 'Sign In <span>→</span>';

  document.querySelector("#auth-message").innerHTML =
    reg
      ? `Already have an account?
         <button type="button" data-auth-switch="login">Sign in</button>`
      : `Don't have an account?
         <button type="button" data-auth-switch="register">Create one</button>`;

  document.querySelector("#auth-login-tab")
    .classList.toggle("active", !reg);

  document.querySelector("#auth-register-tab")
    .classList.toggle("active", reg);
}

// Switch between login and registration

document.addEventListener("click", e => {
  if (e.target.closest("#auth-login-tab")) {
    applyMode("login");
  }

  if (e.target.closest("#auth-register-tab")) {
    applyMode("register");
  }

  const switchButton = e.target.closest("[data-auth-switch]");

  if (switchButton) {
    applyMode(switchButton.dataset.authSwitch);
  }

  // Forgot Password ক্লিক
  if (e.target.closest("[data-forgot-password]")) {
    e.preventDefault();
    const modal = document.querySelector("#modal");
    const modalBody = document.querySelector("#modal-body");
    if (!modal || !modalBody) return;

    modalBody.innerHTML = `
      <h2 style="font-family:Space Grotesk; margin-bottom: 20px;">Reset Password Request</h2>
      <form id="reset-request-form" class="form-grid">
        <div class="field field-full">
          <label>Student ID</label>
          <input type="text" name="studentId" placeholder="Enter your Student ID" required>
        </div>
        <div class="field field-full">
          <button class="btn btn-primary" type="submit" style="width:100%;">Send Reset Request</button>
        </div>
      </form>
    `;
    modal.showModal();
    return;
  }

  // Reset request form submit
  if (e.target.id === "reset-request-form") {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
    
    try {
      const result = await apiFetch("/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ studentId: form.querySelector('[name="studentId"]').value.trim() })
      });
      toast(result.message || "Request sent to admin.");
      document.querySelector("#modal")?.close();
    } catch (error) {
      toast(error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Reset Request";
    }
    return;
  }
});

// Login and registration

document.addEventListener("submit", async e => {
  if (e.target.id !== "auth-form") return;

  e.preventDefault();

  const form = e.target;
  const submit = document.querySelector("#auth-submit");

  if (submit.disabled) return;

  submit.disabled = true;

  submit.innerHTML = "Please wait...";

  try {
    const body = {
      studentId: document.querySelector("#auth-identity").value.trim(),
      password: document.querySelector("#auth-password").value,
      // লগইনেও ডিপার্টমেন্ট ও জেন্ডার পাঠানো হবে
      department: document.querySelector("#auth-department").value,
      gender: document.querySelector("#auth-gender").value
    };

    let result;

    if (authMode === "register") {
      const confirmPassword =
        document.querySelector("#auth-confirm-password").value;

      if (body.password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }
      body.name = document.querySelector("#auth-name").value.trim();

      result = await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify(body)
      });

    } else {
      result = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(body)
      });
    }

    setSession(result.token, result.user);

    state.authenticated = true;

    state.currentUser.name = result.user.name;
    state.currentUser.studentId = result.user.student_id;
    state.currentUser.department = result.user.department;
    state.currentUser.role = result.user.role || "student";

    toast(
      authMode === "register"
        ? "Account created successfully."
        : "Welcome back to CampusPool."
    );

    navigate(
      result.user.role === "admin"
        ? "admin"
        : "dashboard"
    );

  } catch (err) {
    toast(err.message);

  } finally {
    if (submit.isConnected) {
      submit.disabled = false;

      submit.innerHTML =
        authMode === "register"
          ? 'Create Account <span>→</span>'
          : 'Sign In <span>→</span>';
    }
  }
});
