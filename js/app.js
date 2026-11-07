import { state } from "./state.js";
import { clearSession } from "./api.js";

import { renderDashboard, loadDashboardRides } from "./features/dashboard.js";
import { renderAuth } from "./features/auth.js";
import { renderRides, bindRideActions } from "./features/rides.js";

import { renderChat, bindChat, loadChat } from "./features/chat.js";
import { renderFemaleOnly } from "./features/female-only.js";
import { renderSafety } from "./features/safety.js";
import { renderProfile } from "./features/profile.js";
import { renderStudentProfile, loadStudentProfile } from "./features/student-profile.js";
import { renderLiveTracking } from "./features/live-tracking.js";

import { renderRecurring } from "./features/recurring.js";

import {
  renderNotifications,
  loadNotifications,
  startNotificationPolling // <--- ১. এখানে নতুন ইম্পোর্ট যোগ করা হলো
} from "./features/notifications.js";

import { renderImpact } from "./features/impact.js";
import { renderAdmin } from "./features/admin.js";
import { renderBookings, loadBookings } from "./features/bookings.js";

import {
  renderActivities,
  loadActivities
} from "./features/activities.js";

import {
  renderRideDetails,
  loadRideDetails
} from "./features/ride-details.js";


/* =========================================
   DOM ELEMENTS
========================================= */

const root = document.querySelector("#view-root");
const title = document.querySelector("#page-title");
const modal = document.querySelector("#modal");
const modalBody = document.querySelector("#modal-body");


/* =========================================
   PAGE TITLES
========================================= */

const titles = {
  dashboard: "Dashboard",
  "find-rides": "Find a ride",
  "post-ride": "Post a ride",
  bookings: "My bookings",
  activities: "My Activities",
  "ride-details": "Ride Details",
  chat: "Messages",
  "student-profile": "Student Profile",
  recurring: "Recurring rides",
  impact: "Your impact",
  female: "Female-only rides",
  safety: "Safety centre",
  profile: "Profile & reviews",
  notifications: "Notifications",
  admin: "Admin Dashboard",
  auth: "Student verification",
  "fare-split": "Automatic fare split",
  matching: "Smart ride matching",
  "live-tracking": "Live trip tracking"
};


/* =========================================
   ADMIN PAGE TITLES
========================================= */

const adminTitles = {
  overview: "Overview",
  users: "User Management",
  rides: "Ride Management",
  bookings: "Booking Management",
  safety: "SOS & Safety",
  logs: "Activity Logs"
};


/* =========================================
   PAGE RENDERERS
========================================= */

const renderers = {
  dashboard: renderDashboard,
  "find-rides": () => renderRides("find"),
  "post-rides": () => renderRides("post"),
  "post-ride": () => renderRides("post"),
  bookings: renderBookings,
  activities: renderActivities,
  "ride-details": renderRideDetails,
  chat: renderChat,
  "student-profile": renderStudentProfile,
  recurring: renderRecurring,
  impact: renderImpact,
  female: renderFemaleOnly,
  safety: renderSafety,
  profile: renderProfile,
  notifications: renderNotifications,
  admin: renderAdmin,
  auth: renderAuth,
  
  
  "live-tracking": renderLiveTracking
};


/* =========================================
   TOAST
========================================= */

export function toast(message) {
  const region = document.querySelector("#toast-region");

  if (!region) return;

  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;

  region.append(item);

  setTimeout(() => item.remove(), 3200);
}


/* =========================================
   MODAL
========================================= */

export function openModal(html) {
  if (!modal || !modalBody) return;

  modalBody.innerHTML = html;
  modal.showModal();
}


/* =========================================
   PROTECTED VIEWS
========================================= */

const protectedViews = new Set([
  "dashboard",
  "find-rides",
  "post-ride",
  "bookings",
  "activities",
  "ride-details",
  "chat",
  "student-profile",
  "recurring",
  "impact",
  "female",
  "safety",
  "profile",
  "notifications",
  "admin",
  "fare-split",
  "matching",
  "live-tracking"
]);


/* =========================================
   ADMIN TABS
========================================= */

const allowedAdminTabs = [
  "overview",
  "users",
  "rides",
  "bookings",
  "safety",
  "logs"
];


/* =========================================
   CHECK ADMIN
========================================= */

function isAdmin() {
  return (
    state.authenticated &&
    state.currentUser?.role === "admin"
  );
}


/* =========================================
   UPDATE ACCOUNT HEADER
========================================= */

function updateAccountHeader() {

  const appShell = document.querySelector(".app-shell");

  appShell?.classList.toggle(
    "auth-mode",
    !state.authenticated
  );

  const admin = isAdmin();

  // Student Sidebar
  const studentSidebar = document.querySelector(
    "#student-sidebar-content"
  );

  // Admin Sidebar
  const adminSidebar = document.querySelector(
    "#admin-sidebar-content"
  );

  if (studentSidebar) {
    studentSidebar.hidden = admin;
  }

  if (adminSidebar) {
    adminSidebar.hidden = !admin;
  }

  // User Information
  const name = state.currentUser?.name || "Student";

  const nameEl = document.querySelector("#header-username");
  const avatar = document.querySelector("#header-avatar");

  const sidebarName = document.querySelector("#sidebar-username");
  const sidebarAvatar = document.querySelector("#sidebar-avatar");
  const sidebarMeta = document.querySelector("#sidebar-user-meta");

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map(x => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "CP";

  if (nameEl) {
    nameEl.textContent = name.split(" ")[0];
  }

  if (avatar) {
    avatar.textContent = initials;
  }

  if (sidebarName) {
    sidebarName.textContent = state.authenticated
      ? name
      : "CampusPool student";
  }

  if (sidebarAvatar) {
    sidebarAvatar.textContent = initials;
  }

  if (sidebarMeta) {
    sidebarMeta.textContent = !state.authenticated
      ? "Student account"
      : admin
        ? "CampusPool Admin"
        : (state.currentUser?.department || "Student account");
  }

  // Admin-only topbar adjustments
  const searchWrapper = document.querySelector(
    "#global-search-wrapper"
  );

  const notificationButton = document.querySelector(
    "#header-notification-button"
  );

  const studentHelp = document.querySelector(
    "#student-sidebar-help"
  );

  const profileButton = document.querySelector(
    "#sidebar-profile-button"
  );

  if (searchWrapper) {
    searchWrapper.hidden = admin;
  }

  if (notificationButton) {
    notificationButton.hidden = admin;
  }

  if (studentHelp) {
    studentHelp.hidden = admin;
  }

  if (profileButton) {
    profileButton.hidden = admin;
  }

  // Breadcrumb
  const breadcrumb = document.querySelector(
    "#breadcrumb-section"
  );

  if (breadcrumb) {
    breadcrumb.textContent = admin
      ? "Administration"
      : "Workspace";
  }

  // Logout
  const logoutButton = document.querySelector("#logout-button");

  if (logoutButton) {
    logoutButton.hidden = !state.authenticated;
  }
}


/* =========================================
   LOGOUT
========================================= */

export function logout() {

  state.authenticated = false;

  if (state.currentUser) {
    state.currentUser.verified = false;
    state.currentUser.role = "student";
  }

  state.currentAdminTab = "overview";

  clearSession();

  localStorage.removeItem("campuspool_authenticated");
  localStorage.removeItem("campuspool_name");
  localStorage.removeItem("campuspool_email");
  localStorage.removeItem("campuspool_student_id");
  localStorage.removeItem("campuspool_department");
  localStorage.removeItem("campuspool_user_id");

  navigate("auth");

  toast("You have been logged out.");
}


/* =========================================
   OPEN STUDENT PROFILE
========================================= */

export function openStudentProfile(userId) {

  const id = Number(userId);

  if (!Number.isInteger(id) || id <= 0) {
    toast("Invalid student profile.");
    return;
  }

  state.viewedStudentId = id;

  navigate("student-profile");
}


/* =========================================
   OPEN OWN PROFILE
========================================= */

export function openMyProfile() {

  if (!state.authenticated) {
    navigate("auth");
    return;
  }

  if (isAdmin()) {
    toast("Admin profile access is not available here.");
    return;
  }

  navigate("profile");
}


/* =========================================
   MAIN NAVIGATION
========================================= */

export function navigate(view) {

  // Unknown view
  if (!renderers[view]) {
    view = "dashboard";
  }

  // Authentication protection
  if (protectedViews.has(view) && !state.authenticated) {

    view = "auth";

    if (state.currentView !== "auth") {
      toast("Please sign in first to access CampusPool.");
    }
  }

  // Admin-only protection
  if (view === "admin" && !isAdmin()) {

    toast("Admin access required.");

    view = "dashboard";
  }

  // Admin tab validation
  if (view === "admin") {

    if (!allowedAdminTabs.includes(state.currentAdminTab)) {
      state.currentAdminTab = "overview";
    }
  }

  state.currentView = view;

  // Page title
  if (title) {

    title.textContent = view === "admin"
      ? adminTitles[state.currentAdminTab] || "Admin Dashboard"
      : titles[view] || "CampusPool";
  }

  // Render page
  if (root) {
    root.innerHTML = renderers[view]();
  }

  // Update sidebar/header
  updateAccountHeader();

  // Sidebar active state
  document.querySelectorAll("[data-view]").forEach(button => {

    const isActive =
      button.dataset.view === view &&
      (
        view !== "admin" ||
        button.dataset.adminTab === state.currentAdminTab
      );

    button.classList.toggle("active", isActive);
  });

  // Student actions
  bindRideActions();
  bindChat();

  // Load page data
  if (view === "bookings" && state.authenticated) {
    loadBookings();
  }

  if (view === "activities" && state.authenticated) {
    loadActivities();
  }

  if (view === "dashboard" && state.authenticated) {
    loadDashboardRides();
  }

  if (view === "ride-details" && state.authenticated) {
    loadRideDetails();
  }

  if (view === "chat" && state.authenticated) {
    loadChat();
  }

  if (view === "student-profile" && state.authenticated) {
    loadStudentProfile();
  }

  if (view === "notifications" && state.authenticated) {
    loadNotifications();
  }

  // Close mobile sidebar
  document.querySelector(".sidebar")
    ?.classList.remove("open");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================================
   GLOBAL CLICK HANDLER
========================================= */

document.addEventListener("click", e => {

  // Logout
  if (e.target.closest("#logout-button")) {
    logout();
    return;
  }

  // Open own profile
  if (
    e.target.closest("#header-avatar") ||
    e.target.closest("#header-username") ||
    e.target.closest("#sidebar-avatar") ||
    e.target.closest("#sidebar-username")
  ) {
    e.preventDefault();
    openMyProfile();
    return;
  }

  // Open another student's profile
  const studentProfile = e.target.closest(
    "[data-open-student-profile]"
  );

  if (studentProfile) {

    e.preventDefault();

    const userId = studentProfile.dataset.openStudentProfile;

    if (userId) {
      openStudentProfile(userId);
    }

    return;
  }

  // Sidebar navigation
  const nav = e.target.closest("[data-view]");

  if (nav) {

    e.preventDefault();

    if (nav.dataset.view === "admin" && isAdmin()) {

      const selectedTab = nav.dataset.adminTab || "overview";

      if (allowedAdminTabs.includes(selectedTab)) {
        state.currentAdminTab = selectedTab;
      }
    }

    navigate(nav.dataset.view);

    return;
  }

  // Close modal
  if (e.target.closest("[data-close-modal]")) {
    modal?.close();
    return;
  }

  if (e.target === modal) {
    modal?.close();
    return;
  }

  // Mobile menu
  const mobileMenu = e.target.closest("[data-menu-toggle]");

  if (mobileMenu) {

    document.querySelector(".sidebar")
      ?.classList.toggle("open");
  }

});


/* =========================================
   GLOBAL SEARCH
========================================= */

const globalSearch = document.querySelector("#global-search");

if (globalSearch) {

  globalSearch.addEventListener("input", e => {

    if (isAdmin()) return;

    state.searchQuery = e.target.value.trim().toLowerCase();

    navigate("find-rides");
  });

}


/* =========================================
   ESCAPE KEY
========================================= */

window.addEventListener("keydown", e => {

  if (e.key === "Escape" && modal?.open) {
    modal.close();
  }

});


/* =========================================
   INITIAL PAGE
========================================= */

state.currentAdminTab = "overview";

if (state.authenticated) {

  // ২. লগইন থাকা অবস্থায় নোটিফিকেশন পোলিং চালু করা হলো
  startNotificationPolling();

  navigate(isAdmin() ? "admin" : "dashboard");

} else {

  navigate("auth");

}