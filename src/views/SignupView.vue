<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const fullName = ref("");
const phone = ref("");
const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

const handleSignup = async () => {
  error.value = "";
  loading.value = true;

  try {
    await authStore.signUp(
      email.value,
      password.value,
      fullName.value,
      phone.value,
    );

    router.push("/login");
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-[#080808] text-white lg:grid lg:grid-cols-2">
    <!-- Branding -->
    <div class="relative hidden overflow-hidden lg:flex lg:min-h-screen">
      <div
        class="absolute inset-0 bg-gradient-to-br from-[#111111] via-[#080808] to-[#000000]"
      ></div>

      <div
        class="absolute -right-32 -top-32 h-96 w-96 rounded-full border border-[#D4AF37]/20"
      ></div>
      <div
        class="absolute -bottom-40 -left-32 h-[500px] w-[500px] rounded-full border border-[#D4AF37]/10"
      ></div>

      <div class="relative z-10 flex w-full flex-col justify-between p-12">
        <div class="flex items-center gap-3">
          <div
            class="flex h-11 w-11 items-center justify-center rounded-xl bg-[#D4AF37] font-black text-black"
          >
            PS
          </div>

          <div>
            <p class="font-bold">Project Souls</p>
            <p class="text-xs text-gray-500">Transfiguration Church</p>
          </div>
        </div>

        <div class="max-w-lg">
          <p
            class="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-[#D4AF37]"
          >
            Transfiguration Church
          </p>

          <h1 class="text-5xl font-black leading-tight">
            Go out.
            <span class="text-[#D4AF37]"> Reach souls. </span>
          </h1>

          <p class="mt-6 max-w-md text-gray-400 leading-7">
            Create your account and help us keep an organized record of everyone
            we meet through evangelism.
          </p>
        </div>

        <p class="text-sm text-gray-600">Project Souls</p>
      </div>
    </div>

    <!-- Signup -->
    <div
      class="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8"
    >
      <div class="w-full max-w-md">
        <!-- Mobile logo -->
        <div class="mb-10 flex items-center gap-3 lg:hidden">
          <div
            class="flex h-11 w-11 items-center justify-center rounded-xl bg-[#D4AF37] font-black text-black"
          >
            PS
          </div>

          <div>
            <p class="font-bold">Project Souls</p>
            <p class="text-xs text-gray-500">Transfiguration Church</p>
          </div>
        </div>

        <div class="mb-8">
          <div class="mb-5 h-1 w-10 rounded-full bg-[#D4AF37]"></div>

          <p class="text-sm font-semibold text-[#D4AF37]">Join Project Souls</p>

          <h2 class="mt-2 text-3xl font-black sm:text-4xl">Create account</h2>

          <p class="mt-3 text-sm text-gray-500">
            Set up your account to start recording your outreach.
          </p>
        </div>

        <form @submit.prevent="handleSignup" class="space-y-4">
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-300">
              Full name
            </label>

            <input
              v-model="fullName"
              type="text"
              required
              placeholder="Enter your full name"
              class="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
            />
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-gray-300">
              Phone number
            </label>

            <input
              v-model="phone"
              type="tel"
              placeholder="Enter your phone number"
              class="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
            />
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-gray-300">
              Email address
            </label>

            <input
              v-model="email"
              type="email"
              required
              placeholder="you@example.com"
              class="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
            />
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-gray-300">
              Password
            </label>

            <input
              v-model="password"
              type="password"
              required
              minlength="6"
              placeholder="Create a password"
              class="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
            />

            <p class="mt-1.5 text-xs text-gray-600">Minimum 6 characters</p>
          </div>

          <div
            v-if="error"
            class="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400"
          >
            {{ error }}
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="mt-2 w-full rounded-xl bg-[#D4AF37] px-4 py-3.5 text-sm font-black text-black transition hover:bg-[#E2C45A] disabled:opacity-50"
          >
            {{ loading ? "Creating account..." : "Create account" }}
          </button>
        </form>

        <p class="mt-8 text-center text-sm text-gray-500">
          Already have an account?

          <button
            @click="router.push('/login')"
            class="ml-1 font-bold text-[#D4AF37] hover:text-[#E2C45A]"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  </div>
</template>
