import { createRouter, createWebHistory } from "vue-router";

import { useAuthStore } from "../stores/auth";

const routes = [
  {
    path: "/",
    redirect: "/dashboard",
  },

  {
    path: "/login",
    component: () => import("../views/LoginView.vue"),
  },

  {
    path: "/signup",
    component: () => import("../views/SignupView.vue"),
  },

  {
    path: "/team-selection",
    component: () => import("../views/TeamSelectionView.vue"),
  },

  {
    path: "/dashboard",
    component: () => import("../views/DashboardView.vue"),
  },

  {
    path: "/record-person",
    component: () => import("../views/RecordPersonView.vue"),
  },

  {
    path: "/outing/:id",
    component: () => import("../views/OutingView.vue"),
  },

  {
    path: "/people",
    component: () => import("../views/PeopleView.vue"),
  },

  {
    path: "/contacts",
    component: () => import("../views/ContactsView.vue"),
  },
  {
    path: "/pastor",
    component: () => import("../views/PastorView.vue"),
    meta: {
      pastorOnly: true,
    },
  },
  {
    path: "/first-timers",
    component: () => import("../views/FirstTimersView.vue"),
    meta: {
      firstTimerAccess: true,
    },
  },
  {
    path: "/profile",
    name: "Profile",
    component: () => import("../views/Profile.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

/* Everything requires a session except these. */
const PUBLIC_PATHS = ["/login", "/signup"];

router.beforeEach((to) => {
  const authStore = useAuthStore();

  const isPublic = PUBLIC_PATHS.includes(to.path);

  if (!isPublic && !authStore.user) {
    return "/login";
  }

  if (isPublic && authStore.user) {
    return "/dashboard";
  }

  if (to.meta.pastorOnly && !authStore.profile?.is_pastor) {
    return "/dashboard";
  }
  if (
    to.meta.firstTimerAccess &&
    !authStore.profile?.is_pastor &&
    !authStore.profile?.is_first_timer_coordinator
  ) {
    return "/dashboard";
  }
});

export default router;
