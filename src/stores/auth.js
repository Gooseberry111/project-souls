import { defineStore } from "pinia";
import { supabase } from "../lib/supabase";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    profile: null,
    loading: true,
  }),

  actions: {
    async initialize() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      this.user = session?.user ?? null;

      if (this.user) {
        await this.ensureProfile();
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        this.user = session?.user ?? null;

        if (this.user) {
          await this.ensureProfile();
        } else {
          this.profile = null;
        }
      });

      this.loading = false;
    },

    async ensureProfile() {
      if (!this.user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", this.user.id)
        .maybeSingle();

      if (error) {
        console.error("Profile lookup error:", error);
        return;
      }

      if (data) {
        this.profile = data;
        return;
      }

      /*
       * SPECIAL EMAILS
       * Replace these with the real church emails.
       */

      const pastorEmails = ["kelvinherogod@gmail.com"];

      const coordinatorEmails = [
        "udembaugochukwu09@gmail.com",
        "uzomak22@gmail.com",
        "graceukat@gmail.com",
      ];

      const userEmail = this.user.email?.toLowerCase() || "";

      const isPastor = pastorEmails.some(
        (email) => email.toLowerCase() === userEmail,
      );

      const isCoordinator = coordinatorEmails.some(
        (email) => email.toLowerCase() === userEmail,
      );

      const { data: newProfile, error: createError } = await supabase
        .from("profiles")
        .insert({
          id: this.user.id,

          full_name: this.user.user_metadata?.full_name || "",

          phone: this.user.user_metadata?.phone || "",

          role: isPastor ? "pastor" : isCoordinator ? "coordinator" : "member",

          is_pastor: isPastor,

          is_first_timer_coordinator: isCoordinator,
        })
        .select()
        .single();

      if (createError) {
        console.error("Profile creation error:", createError);
        return;
      }

      this.profile = newProfile;
    },

    async fetchProfile() {
      if (!this.user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", this.user.id)
        .maybeSingle();

      if (error) {
        console.error("Profile fetch error:", error);
        return;
      }

      this.profile = data;
    },

    async signUp(email, password, fullName, phone) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone,
          },
        },
      });

      if (error) throw error;

      return data;
    },

    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      this.user = data.user;

      await this.ensureProfile();

      return data;
    },

    async signOut() {
      await supabase.auth.signOut();

      this.user = null;
      this.profile = null;
    },
  },

  persist: true,
});
