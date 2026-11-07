
// Shared application state

export const state = {
  currentView: "auth",

  authenticated: Boolean(localStorage.getItem("campuspool_token")),

  searchQuery: "",

  currentUser: {
    name: localStorage.getItem("campuspool_name") || "",
    studentId: localStorage.getItem("campuspool_student_id") || "",
    department: localStorage.getItem("campuspool_department") || "",

    // Admin role is now restored after page refresh
    role: localStorage.getItem("campuspool_role") || "student",
    accountStatus: localStorage.getItem("campuspool_account_status") || "active",

    phone1: localStorage.getItem("campuspool_profile_phone1") || "",
    phone2: localStorage.getItem("campuspool_profile_phone2") || "",
    photo: localStorage.getItem("campuspool_profile_photo") || "",
    studentCard: localStorage.getItem("campuspool_profile_studentCard") || "",
    nidCard: localStorage.getItem("campuspool_profile_nidCard") || "",
    verified: false
  },

  rides: [
    {
      id: 101,
      driver: "Rafiul Hasan",
      initials: "RH",
      from: "Bashundhara R/A",
      to: "Northern University",
      time: "8:30 AM",
      date: "Today",
      seats: 3,
      vehicle: "Car",
      fare: 60,
      rating: 4.8,
      femaleOnly: false,
      detour: 4,
      status: "Open",
      ownerId: "demo-101",
      requests: []
    },
    {
      id: 102,
      driver: "Nusrat Jahan",
      initials: "NJ",
      from: "Mirpur 10",
      to: "Northern University",
      time: "8:15 AM",
      date: "Today",
      seats: 2,
      vehicle: "Car",
      fare: 55,
      rating: 4.9,
      femaleOnly: true,
      detour: 3,
      status: "Open",
      ownerId: "demo-101",
      requests: []
    },
    {
      id: 103,
      driver: "Tanvir Ahmed",
      initials: "TA",
      from: "Uttara Sector 7",
      to: "Northern University",
      time: "8:10 AM",
      date: "Today",
      seats: 3,
      vehicle: "Bike",
      fare: 35,
      rating: 4.7,
      femaleOnly: false,
      detour: 6,
      status: "Open",
      ownerId: "demo-101",
      requests: []
    },
    {
      id: 104,
      driver: "Samia Rahman",
      initials: "SR",
      from: "Kuril Bishwa Road",
      to: "Northern University",
      time: "9:00 AM",
      date: "Today",
      seats: 1,
      vehicle: "Car",
      fare: 65,
      rating: 5.0,
      femaleOnly: true,
      detour: 2,
      status: "Open",
      ownerId: "demo-101",
      requests: []
    }
  ],

  bookings: [],

  notifications: [
    {
      title: "Welcome to CampusPool",
      text: "Complete student verification to unlock ride booking.",
      time: "Just now",
      kind: "system",
      unread: true
    },
    {
      title: "Ride reminder",
      text: "Your morning commute is coming up.",
      time: "Today",
      kind: "ride",
      unread: true
    },
    {
      title: "Safety tip",
      text: "Share trip details with someone you trust.",
      time: "Yesterday",
      kind: "safety",
      unread: true
    }
  ],

  messages: [
    {
      from: "Rafiul Hasan",
      text: "Hey! I'm leaving in 10 minutes. Meet near the main gate?",
      mine: false,
      time: "8:02 AM"
    }
  ],

  recurring: [],
  reviews: [],

  filters: {
    vehicle: "All",
    femaleOnly: false,
    maxDetour: 15,
    from: "",
    to: ""
  }
};
