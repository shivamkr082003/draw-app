"use client";

import { useState, useEffect } from "react";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import {
  Pencil,
  Share2,
  Users2,
  Github,
  Plus,
  ArrowRight,
  Palette,
  Zap,
} from "lucide-react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { HTTP_BACKEND } from "@/config";
import { useClientOnly } from "../hooks/useClientOnly";

function App() {
  const [roomName, setRoomName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [user, setUser] = useState<{ name: string; token: string } | null>(
    null
  );
  const router = useRouter();
  const isClient = useClientOnly();

  useEffect(() => {
    
    if (isClient && typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      const userName = localStorage.getItem("userName");
      if (token && userName) {
        setUser({ name: userName, token });
      }
    }
  }, [isClient]);

  const createRoom = async () => {
    if (!roomName.trim()) {
      alert("Please enter a room name");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please sign in first to create a room");
      router.push("/signin");
      return;
    }

    setIsCreating(true);
    try {
      console.log("Creating room with name:", roomName);
      console.log("Using token:", token);

      const response = await axios.post(
        `${HTTP_BACKEND}/room`,
        { name: roomName },
        {
          headers: {
            authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("Room creation response:", response.data);

      if (response.data.roomId || response.data.slug) {
        const roomSlug = response.data.slug || roomName;
        console.log("Navigating to room:", roomSlug);
        router.push(`/canvas/${roomSlug}`);
      } else {
        alert("Failed to create room: No room ID returned");
      }
    } catch (error: unknown) {
      console.error("Failed to create room:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("Error response:", error.response.data);
        alert(
          `Failed to create room: ${error.response.data.message || error.response.status}`
        );
      } else {
        alert("Failed to create room: Network error");
      }
    } finally {
      setIsCreating(false);
    }
  };

  const joinRandomRoom = async () => {
    const randomId = `demo-${Math.random().toString(36).substring(2, 8)}`;
    
    setIsCreating(true);
    try {
      let token = localStorage.getItem("token");
      
      if (!token) {
        const guestToken = `guest_${Math.random().toString(36).substring(7)}`;
        localStorage.setItem("token", guestToken);
        token = guestToken;
      }

      console.log("Creating demo room with name:", randomId);
      
      const response = await axios.post(
        `${HTTP_BACKEND}/room`,
        { name: randomId },
        {
          headers: {
            authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("Demo room creation response:", response.data);

      if (response.data.roomId || response.data.slug) {
        const roomSlug = response.data.slug || randomId;
        console.log("Navigating to demo room:", roomSlug);
        router.push(`/canvas/${roomSlug}`);
      } else {
        alert("Failed to create demo room: No room ID returned");
      }
    } catch (error: unknown) {
      console.error("Failed to create demo room:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("Error response:", error.response.data);
        alert(
          `Failed to create demo room: ${error.response.data.message || error.response.status}`
        );
      } else {
        alert("Failed to create demo room: Network error");
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <nav className="border-b border-slate-200/60 bg-white/90 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-purple-500 rounded-2xl blur opacity-75"></div>
                <div className="relative w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Palette className="w-6 h-6 text-white" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-extrabold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
                  Excalidraw
                </span>
                <p className="text-xs text-slate-500 -mt-1">Collaborative Whiteboard</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isClient ? (
                user ? (
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-violet-50 to-purple-50 rounded-full">
                      <div className="w-8 h-8 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                        {user.name[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-slate-700">
                        {user.name}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        localStorage.clear();
                        setUser(null);
                      }}
                      className="border-slate-300 hover:bg-slate-50"
                    >
                      Sign Out
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Link href="/signin">
                      <Button variant="ghost" className="font-medium">Sign In</Button>
                    </Link>
                    <Link href="/signup">
                      <Button className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/30 font-medium">
                        Get Started Free
                      </Button>
                    </Link>
                  </div>
                )
              ) : (
                <div className="w-40 h-10 bg-slate-200 animate-pulse rounded-lg"></div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]"></div>
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-violet-400 opacity-20 blur-[100px]"></div>
        
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-5xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-100 text-violet-700 rounded-full text-sm font-medium mb-8">
              <Zap className="w-4 h-4" />
              Free & Open Source
            </div>
            
            <h1 className="text-6xl sm:text-7xl md:text-8xl font-black tracking-tight mb-8">
              <span className="text-slate-900">Create.</span>
              <span className="text-slate-900"> Collaborate.</span>
              <span className="block mt-2 bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                Draw Anything.
              </span>
            </h1>
            
            <p className="text-xl sm:text-2xl text-slate-600 mb-12 max-w-3xl mx-auto leading-relaxed font-light">
              The ultimate collaborative whiteboard for teams. Create stunning diagrams, 
              wireframes, and illustrations together in real-time.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
              {isClient ? (
                user ? (
                  <div className="w-full max-w-2xl">
                    <div className="flex flex-col sm:flex-row gap-3 p-2 bg-white rounded-2xl shadow-2xl shadow-violet-500/10 border border-slate-200">
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Name your workspace..."
                          value={roomName}
                          onChange={(e) => setRoomName(e.target.value)}
                          className="w-full px-6 py-4 border-0 rounded-xl focus:ring-2 focus:ring-violet-500 text-slate-900 placeholder:text-slate-400 text-lg"
                          onKeyPress={(e) => e.key === "Enter" && createRoom()}
                        />
                      </div>
                      <Button
                        onClick={createRoom}
                        disabled={!roomName.trim() || isCreating}
                        className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 px-8 py-4 h-auto text-lg font-semibold shadow-lg shadow-violet-500/30"
                      >
                        {isCreating ? (
                          <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <Plus className="w-5 h-5 mr-2" />
                            Create Workspace
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Link href="/signup">
                      <Button
                        size="lg"
                        className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 px-10 py-6 h-auto text-lg font-semibold shadow-2xl shadow-violet-500/30 rounded-2xl"
                      >
                        Start Creating Free
                        <ArrowRight className="ml-2 w-5 h-5" />
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={joinRandomRoom}
                      disabled={isCreating}
                      className="px-10 py-6 h-auto text-lg border-2 border-slate-300 hover:border-violet-500 hover:bg-violet-50 font-semibold rounded-2xl"
                    >
                      {isCreating ? (
                        <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Zap className="w-5 h-5 mr-2" />
                          Try Demo
                        </>
                      )}
                    </Button>
                  </div>
                )
              ) : (
                <div className="flex justify-center gap-4">
                  <div className="w-48 h-14 bg-slate-200 animate-pulse rounded-2xl"></div>
                  <div className="w-48 h-14 bg-slate-200 animate-pulse rounded-2xl"></div>
                </div>
              )}
            </div>

            {!user && isClient && (
              <p className="text-sm text-slate-500">
                No credit card required • Start in seconds • Free forever
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="py-24 bg-white border-y border-slate-200">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
              Powerful features for modern teams
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Everything you need to bring your ideas to life
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="p-8 border-2 border-slate-100 hover:border-violet-200 hover:shadow-2xl hover:shadow-violet-500/10 transition-all duration-500 group bg-gradient-to-br from-white to-violet-50/30">
              <div className="mb-6">
                <div className="relative inline-block">
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-purple-500 rounded-3xl blur opacity-50 group-hover:opacity-100 transition-opacity"></div>
                  <div className="relative w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Share2 className="w-10 h-10 text-white" />
                  </div>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                Real-Time Collaboration
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Work together seamlessly. See changes instantly as your team creates, with zero lag and perfect synchronization.
              </p>
            </Card>

            <Card className="p-8 border-2 border-slate-100 hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500 group bg-gradient-to-br from-white to-blue-50/30">
              <div className="mb-6">
                <div className="relative inline-block">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-3xl blur opacity-50 group-hover:opacity-100 transition-opacity"></div>
                  <div className="relative w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Pencil className="w-10 h-10 text-white" />
                  </div>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                Intuitive Drawing Tools
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Professional-grade tools that feel natural. Create shapes, diagrams, and stunning visuals effortlessly.
              </p>
            </Card>

            <Card className="p-8 border-2 border-slate-100 hover:border-emerald-200 hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-500 group bg-gradient-to-br from-white to-emerald-50/30">
              <div className="mb-6">
                <div className="relative inline-block">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-3xl blur opacity-50 group-hover:opacity-100 transition-opacity"></div>
                  <div className="relative w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Users2 className="w-10 h-10 text-white" />
                  </div>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                Organized Workspaces
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Create dedicated rooms for every project. Share instantly with a simple link. Stay organized, stay productive.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section className="relative py-32 bg-gradient-to-br from-violet-600 via-purple-600 to-pink-600 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-violet-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <h2 className="text-4xl md:text-6xl font-black text-white mb-8">
              Ready to transform your workflow?
            </h2>
            <p className="text-xl md:text-2xl text-violet-100 mb-12 font-light">
              Join thousands of teams creating amazing things with Excalidraw every day.
            </p>
            <div className="flex flex-col sm:flex-row gap-5 justify-center">
              <Link href="/signup">
                <Button
                  size="lg"
                  className="bg-white text-slate-900 hover:bg-gray-50 hover:scale-105 px-12 py-7 h-auto text-lg font-bold shadow-2xl transition-all duration-300 rounded-2xl [&]:text-slate-900"
                >
                  Start Creating Now
                  <ArrowRight className="ml-2 w-6 h-6" />
                </Button>
              </Link>
              <Button
                size="lg"
                onClick={joinRandomRoom}
                disabled={isCreating}
                className="border-3 border-white text-white bg-transparent hover:bg-white/20 backdrop-blur-sm px-12 py-7 h-auto text-lg font-bold rounded-2xl transition-all duration-300"
              >
                {isCreating ? (
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Zap className="w-6 h-6 mr-2" />
                    Try Demo Now
                  </>
                )}
              </Button>
            </div>
            <p className="mt-8 text-violet-200 text-sm">
              ✨ No installation required • Works in your browser • Free forever
            </p>
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 text-white py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex flex-col items-center md:items-start gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-purple-500 rounded-2xl blur opacity-75"></div>
                  <div className="relative w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center">
                    <Palette className="w-6 h-6 text-white" />
                  </div>
                </div>
                <span className="text-2xl font-bold">Excalidraw</span>
              </div>
              <p className="text-slate-400 text-sm max-w-xs text-center md:text-left">
                The collaborative whiteboard that empowers teams to create together.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-8">
              <div className="flex items-center gap-6 text-sm text-slate-400">
                <a href="#" className="hover:text-white transition-colors font-medium">
                  Privacy
                </a>
                <a href="#" className="hover:text-white transition-colors font-medium">
                  Terms
                </a>
                <a href="#" className="hover:text-white transition-colors font-medium">
                  About
                </a>
              </div>
              <a
                href="#"
                className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
              >
                <Github className="w-5 h-5" />
                <span className="font-medium">View on GitHub</span>
              </a>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-slate-800 text-center text-slate-500 text-sm">
            © 2025 Excalidraw. Built with ❤️ for creative teams everywhere.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
