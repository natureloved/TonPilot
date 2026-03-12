import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TonPilot",
  description: "Automate your TON wallet in plain English",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`bg-background text-foreground antialiased min-h-screen pb-20`}>
        {children}
      </body>
    </html>
  );
}
