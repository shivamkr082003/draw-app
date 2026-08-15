"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const userId = params.get("userId");
    const name = params.get("name");
    const authError = params.get("error");

    if (authError) {
      setError(decodeURIComponent(authError));
      return;
    }

    if (token && userId) {
      localStorage.setItem("token", token);
      localStorage.setItem("userId", userId);
      localStorage.setItem("userName", name || "");

      const returnTo =
        params.get("returnTo") ||
        (typeof window !== "undefined" ? sessionStorage.getItem("returnTo") : null);

      if (returnTo) {
        sessionStorage.removeItem("returnTo");
        router.replace(returnTo);
      } else {
        router.replace("/dashboard");
      }
      return;
    }

    setError("Authentication failed. Missing login credentials.");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Sign in failed
            </h1>
            <p className="text-red-600 dark:text-red-400 mb-6">{error}</p>
            <Link
              href="/signin"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-600 text-white font-medium transition-colors"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">
              Completing sign in...
            </p>
          </>
        )}
      </div>
    </div>
  );
}
