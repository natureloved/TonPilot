"use client";

import dynamic from "next/dynamic";

const TemplatesClient = dynamic(() => import("./TemplatesClient"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[#f0f4ff] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#2563eb] border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

export default function TemplatesPage() {
  return <TemplatesClient />;
}
