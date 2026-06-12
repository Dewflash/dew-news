import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { createServiceClient } from "@/lib/supabase/server";

const AUTHORISED_EMAIL = "dewlearns@gmail.com";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 60 * 60 * 24, // refresh once per day
  },
  callbacks: {
    async signIn({ user }) {
      if (user.email !== AUTHORISED_EMAIL) {
        return "/login?error=unauthorized";
      }

      const supabase = createServiceClient();
      const { error } = await supabase.from("users").upsert(
        {
          email: user.email,
          name: user.name ?? null,
          last_login: new Date().toISOString(),
        },
        { onConflict: "email" }
      );

      if (error) {
        console.error("Failed to upsert user on sign-in:", error);
      }

      return true;
    },
    async jwt({ token }) {
      if (token.email && !token.userId) {
        const supabase = createServiceClient();
        const { data } = await supabase
          .from("users")
          .select("id")
          .eq("email", token.email)
          .single();

        if (data) {
          token.userId = data.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      const userId = token.userId;
      if (userId && session.user) {
        session.user.id = userId;
      }
      return session;
    },
  },
});
