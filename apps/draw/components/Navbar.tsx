"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Palette,
  DoorOpen,
  LogOut,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@repo/ui/button";

interface NavbarProps {
  breadcrumbs?: Array<{ label: string; href?: string }>;
  onJoinRoom?: () => void;
}

export function Navbar({
  breadcrumbs,
  onJoinRoom,
}: NavbarProps) {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      const name = localStorage.getItem("userName");
      if (token && !token.startsWith("guest_")) {
        setIsLoggedIn(true);
        setUserName(name || "User");
      } else if (token) {
        setIsLoggedIn(true);
        setUserName("Guest");
      } else {
        setIsLoggedIn(false);
      }
    }
  }, []);

  const handleSignOut = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("userId");
      localStorage.removeItem("userName");
      setIsLoggedIn(false);
      router.push("/");
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left section: Logo & Breadcrumbs */}
          <div className="flex items-center gap-3.5 min-w-0">
            <Link
              href={isLoggedIn ? "/dashboard" : "/"}
              className="flex items-center gap-2.5 shrink-0 group transition-all"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <Palette className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-violet-700 to-purple-700 bg-clip-text text-transparent hidden sm:inline-block">
                Excalidraw
              </span>
            </Link>

            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5 min-w-0">
                <span className="text-slate-300">/</span>
                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  return (
                    <div key={idx} className="flex items-center gap-1.5 min-w-0">
                      {crumb.href && !isLast ? (
                        <Link
                          href={crumb.href}
                          className="text-xs font-medium text-slate-500 hover:text-violet-700 truncate max-w-[140px] transition-colors"
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span
                          className={`text-xs truncate max-w-[180px] ${
                            isLast
                              ? "font-semibold text-slate-800"
                              : "font-medium text-slate-500"
                          }`}
                        >
                          {crumb.label}
                        </span>
                      )}
                      {!isLast && (
                        <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </nav>
            )}
          </div>

          {/* Right section: Single Join Room + User avatar + Sign out */}
          <div className="hidden sm:flex items-center gap-3">
            {isLoggedIn ? (
              <>
                {onJoinRoom && (
                  <Button
                    variant="outline"
                    onClick={onJoinRoom}
                    className="h-8 px-3 text-xs font-medium border-slate-200 hover:bg-slate-50 hover:border-violet-300 text-slate-700 flex items-center gap-1.5 rounded-lg shadow-2xs transition-all"
                  >
                    <DoorOpen className="w-3.5 h-3.5 text-violet-600" />
                    <span>Join Room</span>
                  </Button>
                )}

                <div className="h-4 w-px bg-slate-200 mx-0.5" />

                {/* User avatar & name pill */}
                <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 border border-slate-200/60 rounded-full">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-violet-600 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
                    {userName ? userName[0].toUpperCase() : "U"}
                  </div>
                  <span className="text-xs font-medium text-slate-700 max-w-[110px] truncate">
                    {userName}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  onClick={handleSignOut}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/signin">
                  <Button variant="ghost" className="h-8 px-3 text-xs font-medium text-slate-700">
                    Sign In
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button className="h-8 px-3.5 text-xs font-medium bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg shadow-xs">
                    Get Started Free
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <div className="flex sm:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-slate-200 py-3 px-2 space-y-2 bg-white/95 animate-in slide-in-from-top-2 duration-150">
            {isLoggedIn ? (
              <>
                <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 rounded-xl mb-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-violet-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                    {userName ? userName[0].toUpperCase() : "U"}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{userName}</p>
                    <p className="text-[10px] text-slate-500">Signed In</p>
                  </div>
                </div>

                {onJoinRoom && (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onJoinRoom();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-700 text-left"
                  >
                    <DoorOpen className="w-4 h-4 text-violet-600" />
                    Join Room
                  </button>
                )}

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 text-left"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </>
            ) : (
              <div className="space-y-1.5 pt-1">
                <Link
                  href="/signin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full py-2 text-center text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full py-2 text-center text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-lg"
                >
                  Get Started Free
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
