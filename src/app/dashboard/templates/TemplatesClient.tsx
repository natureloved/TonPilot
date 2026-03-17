"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Zap, 
  ArrowLeft, 
  RefreshCw, 
  ArrowUpRight, 
  Bell,
  ChevronRight
} from "lucide-react";
import WebApp from "@twa-dev/sdk";

const TEMPLATES = [
  {
    id: "recurring_buy",
    name: "Recurring Buy",
    description: "Buy TON every Friday at 9am UTC",
    icon: <RefreshCw className="w-5 h-5 text-blue-600" />,
    bg: "bg-blue-50"
  },
  {
    id: "price_alert",
    name: "Price Alert Send",
    description: "Send TON to vault when price hits $7.50",
    icon: <Bell className="w-5 h-5 text-orange-600" />,
    bg: "bg-orange-50"
  },
  {
    id: "balance_sweep",
    name: "Balance Sweep",
    description: "Move funds if balance exceeds 100 TON",
    icon: <ArrowUpRight className="w-5 h-5 text-emerald-600" />,
    bg: "bg-emerald-50"
  }
];

export default function TemplatesPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      WebApp.ready();
    }
  }, []);

  const BOT_USERNAME = "TonAutoPilotBot";

  const openBotForRule = () => {
    const url = `https://t.me/${BOT_USERNAME}?start=newrule`;
    try {
      if ((window as any).Telegram?.WebApp?.openTelegramLink) {
        (window as any).Telegram.WebApp.openTelegramLink(url);
      } else {
        window.open(url, "_blank");
      }
    } catch (e) {
      window.open(url, "_blank");
    }
  };

  if (!mounted) return null;

  const handleSelect = (id: string) => {
    if (WebApp?.HapticFeedback) {
      WebApp.HapticFeedback.notificationOccurred("success");
    }
    
    // Instead of a technical alert, show a success confirmation
    WebApp.showConfirm(
      `Confirm setup for "${id}" template? This will take you back to the Pilot to finalize.`,
      (confirmed) => {
        if (confirmed) {
          openBotForRule();
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-[#f0f4ff] font-['Outfit'] pb-20">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#e0e8ff] px-5 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="p-1 hover:bg-slate-100 rounded-lg transition-all">
          <ArrowLeft className="w-5 h-5 text-[#94a3b8]" />
        </button>
        <h1 className="text-sm font-bold text-[#1a1a2e]">Rule Templates</h1>
      </header>

      <div className="max-w-md mx-auto p-5">
        <p className="text-xs text-[#94a3b8] mb-6 px-1">Choose a blueprint to start automating your vault operations instantly.</p>
        
        <div className="space-y-4">
          {TEMPLATES.map((t) => (
            <button 
              key={t.id}
              onClick={() => handleSelect(t.id)}
              className="w-full bg-white border border-[#e0e8ff] rounded-[28px] p-5 text-left flex items-center justify-between group active:scale-[0.98] transition-all shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-2xl ${t.bg} transition-all group-hover:scale-110`}>
                  {t.icon}
                </div>
                <div>
                  <h4 className="font-bold text-[#1a1a2e] text-sm">{t.name}</h4>
                  <p className="text-[10px] text-[#94a3b8] mt-0.5">{t.description}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#e0e8ff] group-hover:translate-x-1 transition-all" />
            </button>
          ))}
        </div>

        <div className="mt-12 bg-blue-600 rounded-[32px] p-8 text-white relative overflow-hidden shadow-xl shadow-blue-200">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-xl" />
          <h3 className="font-bold mb-2 relative z-10">Custom Automation?</h3>
          <p className="text-xs opacity-80 mb-6 leading-relaxed relative z-10">You can also describe your rule in plain English to the Pilot directly.</p>
          <button 
            onClick={() => openBotForRule()}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-md px-6 py-2.5 rounded-full text-xs font-bold transition-all"
          >
            Chat with Pilot
          </button>
        </div>
      </div>
    </div>
  );
}
