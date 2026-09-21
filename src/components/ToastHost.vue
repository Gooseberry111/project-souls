<script setup>
import { dismissToast, toasts } from "../lib/toast";
</script>

<template>
  <!-- aria-live so a screen reader announces a save the same way
       a sighted user sees it. -->
  <div
    class="pointer-events-none fixed inset-x-0 bottom-24 z-[200] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="translate-y-1 opacity-0"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="[
          'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur-xl',
          toast.tone === 'success'
            ? 'border-green-500/30 bg-green-500/[0.12] text-green-300'
            : toast.tone === 'error'
              ? 'border-red-500/30 bg-red-500/[0.12] text-red-300'
              : 'border-white/10 bg-white/[0.07] text-gray-200',
        ]"
      >
        <span class="shrink-0">
          {{ toast.tone === "success" ? "✓" : toast.tone === "error" ? "!" : "•" }}
        </span>

        <p class="min-w-0 flex-1 leading-5">{{ toast.message }}</p>

        <button
          type="button"
          @click="dismissToast(toast.id)"
          aria-label="Dismiss"
          class="shrink-0 opacity-60 transition hover:opacity-100"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
