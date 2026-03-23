import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulseStream",
  description: "Real-Time ICU Patient Anomaly Detection Pipeline",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
