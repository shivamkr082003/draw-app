import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "Excalidraw - Collaborative Whiteboarding",
  description:
    "Create, collaborate, and share beautiful diagrams and sketches with our intuitive drawing tool.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-white text-slate-900">
        {children}
      </body>
    </html>
  );
}
