"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import WebApp from "@twa-dev/sdk";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Home, 
  List, 
  Activity as ActivityIcon, 
  Settings as SettingsIcon,
  Plus,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDown,
  Bell,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  ChevronRight,
  Pause,
  Play,
  Trash2,
  AlertTriangle,
  Zap,
  Coins
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Rule, ExecutionLog, SwapAction, SendAction, ScheduleTrigger } from "@/types";
import { TonConnectButton, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";

// ── Types & Helpers ──────────────────────────────────────────────────────────

type Tab = "home" | "rules" | "activity" | "settings" | "tokens";

function formatRelativeTime(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(Math.abs(diffMs) / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const isFuture = diffMs < 0;
  const suffix = isFuture ? "" : " ago";
  const prefix = isFuture ? "in " : "";

  if (diffSecs < 60) return isFuture ? "soon" : "just now";
  if (diffMins < 60) return `${prefix}${diffMins}m${suffix}`;
  if (diffHours < 24) return `${prefix}${diffHours}h${suffix}`;
  if (diffDays === 1) return isFuture ? "tomorrow" : "yesterday";
  if (diffDays < 7) return `${prefix}${diffDays}d${suffix}`;
  return date.toLocaleDateString();
}

function nextRunText(dateStr: string | null): string {
  if (!dateStr) return "—";
  
  const next = new Date(dateStr);
  const now = new Date();
  const diffMs = next.getTime() - now.getTime();
  
  // If time is in the past, show "updating..." 
  // (scheduler will correct it on next cycle)
  if (diffMs <= 0) return "updating...";
  
  const diffMins  = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays  = Math.floor(diffMs / 86400000);

  if (diffMins < 1)   return "< 1 min";
  if (diffMins < 60)  return `in ${diffMins}m`;
  if (diffHours < 24) return `in ${diffHours}h`;
  if (diffDays === 1) return "tomorrow";
  return `in ${diffDays}d`;
}

function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const m = parseInt(minute, 10);
  const minStr = m === 0 ? "00" : m < 10 ? `0${m}` : `${m}`;
  
  if (hour === "*") {
    // Handling "Every hour" rules
    if (dayOfWeek === "*" && dayOfMonth === "*" && month === "*") return `Every hour at minute ${minStr}`;
    return `Every hour at minute ${minStr} (specific days)`;
  }

  // Format time (Cron is always UTC, so we convert perfectly to browser local time)
  const h = parseInt(hour, 10);
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const days: Record<string, string> = {
    "0": "Sunday", "1": "Monday", "2": "Tuesday",
    "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday"
  };

  const months: Record<string, string> = {
    "1": "January", "2": "February", "3": "March",
    "4": "April", "5": "May", "6": "June", "7": "July",
    "8": "August", "9": "September", "10": "October",
    "11": "November", "12": "December"
  };

  const ordinal = (n: number): string => {
    const s = ["th","st","nd","rd"];
    const v = n % 100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
  };

  if (dayOfWeek === "*" && dayOfMonth === "*" && month === "*") return `Every day at ${timeStr}`;
  if (dayOfWeek !== "*" && dayOfMonth === "*" && month === "*") return `Every ${days[dayOfWeek] ?? "day"} at ${timeStr}`;
  if (dayOfMonth !== "*" && dayOfWeek === "*" && month === "*") return `${ordinal(parseInt(dayOfMonth, 10))} of every month at ${timeStr}`;
  if (dayOfMonth !== "*" && month !== "*") return `${ordinal(parseInt(dayOfMonth, 10))} ${months[month] ?? ""} at ${timeStr}`;

  return `Every day at ${timeStr}`;
}

function formatTriggerText(trigger: any): string {
  if (!trigger) return "Unknown trigger";
  if (trigger.type === "schedule") return cronToHuman(trigger.cron);
  if (trigger.type === "price_above") return `When TON rises above $${trigger.threshold}`;
  if (trigger.type === "price_below") return `When TON drops below $${trigger.threshold}`;
  if (trigger.type === "balance_above") return `When vault rises above ${trigger.threshold} TON`;
  if (trigger.type === "balance_below") return `When vault drops below ${trigger.threshold} TON`;
  return trigger.type;
}

function relativeTime(dateStr: string, full = false): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const mins  = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days  = Math.floor(diffMs / 86400000);

  if (!full) {
    if (mins < 1)   return "just now";
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  }

  // Full timestamp for activity tab
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

const truncateAddr = (addr: string) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "None";

// ── Components ───────────────────────────────────────────────────────────────

export default function ArcticDashboard() {
  const router = useRouter();
  const [tonConnectUI] = useTonConnectUI();
  const userWallet = useTonWallet();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [jettons, setJettons] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showFund, setShowFund] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [swapAmount, setSwapAmount] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [manualUid, setManualUid] = useState("");
  const [showManualLogin, setShowManualLogin] = useState(false);
  const [tonConnectStep, setTonConnectStep] = useState<"idle" | "selecting" | "amount" | "success">("idle");
  const [fundAmount, setFundAmount] = useState("5");

  const handleTonConnect = () => {
    setTonConnectStep("amount");
  };

  const BOT_USERNAME = "TonAutoPilotBot";

  const openBotForRule = () => {
    // Attempt native TG pop, fallback to window.open
    const url = `https://t.me/${BOT_USERNAME}?start=newrule`;
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(url);
        // Force close mini app to return to bot chat
        setTimeout(() => { tg.close(); }, 150);
      } else {
        window.open(url, "_blank");
      }
    } catch (e) {
      window.open(url, "_blank");
    }
  };

  // Initialize & Fetch Data
  const fetchData = useCallback(async (uid: string, isBackground: boolean = false) => {
    if (!isBackground) setLoading(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/user/sync?userId=${uid}&tz=${encodeURIComponent(tz)}`);
      if (!res.ok) throw new Error("Sync API failed");
      
      const { data, success } = await res.json();
      if (success) {
        setWalletAddress(data.walletAddress);
        setBalance(data.balance);
        setPrice(data.price);
        setRules(data.rules);
        setLogs(data.logs);
        setJettons(data.jettons || []);
      }
    } catch (err) {
      console.error("Dashboard Sync Error:", err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  // ── Nav Button Helper ──────────────────────────────────────────────────────
  const NavBtn = ({ id, icon: Icon, label }: { id: Tab, icon: any, label: string }) => {
    const isActive = activeTab === id;
    return (
      <button 
        type="button"
        onClick={() => setActiveTab(id)}
        className="flex flex-col items-center gap-1 transition-all outline-none"
      >
        <div className={`p-2 rounded-2xl transition-all ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}>
          <Icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''}`} />
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-tight ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
          {label}
        </span>
      </button>
    );
  };

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      try {
        const tg = (window as any).Telegram?.WebApp;
        if (tg?.initDataUnsafe?.user?.id) {
          tg.ready();
          tg.expand();
          if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
          const uidStr = tg.initDataUnsafe.user.id.toString();
          setUserId(uidStr);
          fetchData(uidStr);
        } else {
          // Fallback: get userId from URL param for testing
          // e.g. https://tonpilot.vercel.app/dashboard?uid=123456
          const params = new URLSearchParams(window.location.search);
          const uid = params.get("uid");
          if (uid) {
            setUserId(uid);
            fetchData(uid);
          }
        }
      } catch (e) {
        console.error("WebApp Init Error:", e);
      }
    }
  }, [fetchData]);

  // Handle visibility & focus out-of-sync issues for Telegram Mini App
  useEffect(() => {
    if (!userId) return;

    const handleFocus = () => fetchData(userId, true);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchData(userId, true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [userId, fetchData]);

  if (!mounted) return null;

  const toggleRule = async (rule: Rule) => {
    const newStatus = rule.status === "active" ? "paused" : "active";
    // Optimistic update
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: newStatus } : r));

    try {
      const res = await fetch("/api/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, status: newStatus })
      });
      if (!res.ok) throw new Error("Failed to toggle");
    } catch (err) {
      console.error("Toggle error:", err);
      // Revert
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: rule.status } : r));
    }
  };

  const deleteRule = async (id: string) => {
    try {
      const res = await fetch(`/api/rules?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setRules(prev => prev.filter(r => r.id !== id));
        setShowDeleteConfirm(null);
      } else {
        console.error("Delete failed");
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const copyAddress = () => {
    if (walletAddress && typeof window !== "undefined") {
      navigator.clipboard.writeText(walletAddress);
      
      try {
        if ((window as any).Telegram?.WebApp?.HapticFeedback) {
          (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred("success");
        }
      } catch (e) {}

      // Show temporary alert/toast for copies if not in TG
      const btn = document.getElementById("copy-btn-text");
      if (btn) {
        const orig = btn.innerText;
        btn.innerText = "Copied!";
        setTimeout(() => btn.innerText = orig, 2000);
      }
    }
  };

  const handleSwap = async () => {
    const amountVal = parseFloat(swapAmount);
    if (isNaN(amountVal) || amountVal <= 0 || amountVal > balance) {
      alert("Invalid swap amount or insufficient balance.");
      return;
    }
    setSwapping(true);
    try {
      const res = await fetch("/api/wallet/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, fromAsset: "TON", toAsset: "USDT", amount: amountVal }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Swap failed");
      
      alert("Swap triggered via Agent! Check your recent activity log.");
      setShowSwap(false);
      setSwapAmount("");
      fetchData(userId!);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Swap failed to start.");
    } finally {
      setSwapping(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAddress || !withdrawAmount) return;
    const amountVal = parseFloat(withdrawAmount);
    if (isNaN(amountVal) || amountVal <= 0 || amountVal > balance) {
      setWithdrawError("Invalid amount or insufficient balance.");
      return;
    }

    setWithdrawing(true);
    setWithdrawError(null);

    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          toAddress: withdrawAddress,
          amount: amountVal,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Withdrawal failed");

      setWithdrawSuccess(true);
      setTimeout(() => {
        setWithdrawSuccess(false);
        setShowWithdraw(false);
        setWithdrawAddress("");
        setWithdrawAmount("");
        if (userId) fetchData(userId);
      }, 2000);

    } catch (err: any) {
      setWithdrawError(err.message || "An unknown error occurred");
    } finally {
      setWithdrawing(false);
    }
  };

  // ── Render Helpers ──────────────────────────────────────────────────────────

  const Skeleton = ({ className }: { className: string }) => (
    <div className={`bg-slate-200 animate-pulse rounded-lg ${className}`}></div>
  );

  const StatusDot = ({ status }: { status: "success" | "failed" }) => (
    <div className={`w-2 h-2 rounded-full ${status === "success" ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-rose-500 shadow-[0_0_8px_#f43f5e]"}`} />
  );

  // ── Tab Views ──────────────────────────────────────────────────────────────

  const TokensTab = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-[#1a1a2e]">Tokens</h2>
          <p className="text-[#94a3b8] font-medium mt-1">Manage your vault assets</p>
        </div>
      </div>
      
      <div className="bg-white border border-blue-50 shadow-xl shadow-blue-100/50 rounded-[32px] p-6 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-indigo-400/20 rounded-bl-[100px] -z-0"></div>
        <div className="flex justify-between items-center relative z-10 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#2563eb] rounded-full flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-sm">TON</span>
            </div>
            <div>
              <p className="font-bold text-[#1a1a2e]">Toncoin</p>
              <p className="text-xs text-[#64748b]">Native Asset</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-[#1a1a2e]">{balance.toFixed(2)} TON</p>
            <p className="font-bold text-[#2563eb] text-sm">${(balance * price).toFixed(2)}</p>
          </div>
        </div>
      </div>

      {jettons.length > 0 && jettons.map((token: any) => {
        const decimals = token.jetton?.decimals || 9;
        const bal = Number(token.balance) / Math.pow(10, decimals);
        const tokenPrice = token.price?.prices?.USD || ((token.jetton?.symbol === "USDT" || token.jetton?.symbol === "USD₮") ? 1 : 0);
        
        return (
          <div key={token.jetton?.address || token.jetton?.symbol} className="bg-white border border-blue-50 shadow-xl shadow-blue-100/50 rounded-[32px] p-6 mb-6 relative overflow-hidden">
            <div className="flex justify-between items-center relative z-10 mb-4">
              <div className="flex items-center gap-3">
                {token.jetton?.image ? (
                  <img src={token.jetton.image} alt={token.jetton.symbol} className="w-10 h-10 rounded-full shadow-md" />
                ) : (
                  <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center shadow-md">
                    <span className="text-slate-500 font-bold text-sm">{token.jetton?.symbol?.slice(0,3)}</span>
                  </div>
                )}
                <div>
                  <p className="font-bold text-[#1a1a2e]">{token.jetton?.name || "Unknown"}</p>
                  <p className="text-xs text-[#64748b]">{token.jetton?.symbol}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-[#1a1a2e]">{bal.toFixed(2)} {token.jetton?.symbol}</p>
                {tokenPrice > 0 ? (
                  <p className="font-bold text-[#2563eb] text-sm">${(bal * tokenPrice).toFixed(2)}</p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}

      <div className="bg-white border border-blue-50 shadow-xl shadow-blue-100/50 rounded-[32px] p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-500 mb-2">
          <RefreshCw className="w-8 h-8" />
        </div>
        <h3 className="font-bold text-[#1a1a2e] text-xl">Swap & Manage</h3>
        <p className="text-sm text-[#64748b] leading-relaxed max-w-[250px] mx-auto">
          Need to swap to USDT or other Jettons? Just tell TonPilot what you'd like to do.
        </p>
        <button 
          onClick={openBotForRule}
          className="mt-2 w-full bg-[#1a1a2e] hover:bg-slate-800 text-white py-3.5 rounded-2xl font-bold transition shadow-lg"
        >
          Chat with Pilot
        </button>
      </div>
    </div>
  );

  const HomeTab = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Balance Card */}
      <div className="bg-[#2563eb] rounded-[32px] p-8 text-white relative overflow-hidden shadow-xl shadow-blue-200">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12 blur-lg" />
        
        <div className="relative z-10">
          <p className="font-mono text-[10px] tracking-widest uppercase opacity-70 mb-2">Vault Balance</p>
          <div className="flex items-baseline gap-2 mb-1">
            <h2 className="text-4xl font-mono font-bold">{balance.toFixed(2)}</h2>
            <span className="text-xl font-mono opacity-80">TON</span>
          </div>
          <div className="font-mono text-sm opacity-80 flex items-center gap-2">
            <span>≈ ${(balance * price).toFixed(2)}</span>
            <span className="px-1.5 py-0.5 bg-white/20 rounded-md text-[10px] uppercase">
              ${price.toFixed(4)}
            </span>
          </div>

          <div className="flex gap-2 mt-8">
            <button 
              onClick={() => setShowFund(true)}
              className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl py-3 font-mono text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <ArrowDownLeft className="w-4 h-4" /> Fund
            </button>
            <button 
              onClick={() => setShowWithdraw(true)}
              className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl py-3 font-mono text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <ArrowUpRight className="w-4 h-4" /> Withdraw
            </button>
            <button 
              onClick={() => setShowSwap(true)}
              title="Quick Swap"
              className="w-12 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl py-3 flex items-center justify-center transition-all active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {(() => {
          const activeRules = rules.filter(r => r.status === "active");
          const nextRule = activeRules
            .filter(r => r.next_run_at && new Date(r.next_run_at) > new Date())
            .sort((a, b) => 
              new Date(a.next_run_at!).getTime() - 
              new Date(b.next_run_at!).getTime()
            )[0];

          return [
            { label: "Active", val: activeRules.length },
            { label: "Done", val: logs.filter(l => l.status === "success").length },
            { 
              label: nextRule ? nextRule.name : "No upcoming rules", 
              val: nextRule ? nextRunText(nextRule.next_run_at) : "—",
              isNext: true 
            }
          ];
        })().map((s: any, i) => (
          <div key={i} className="bg-white border border-[#e0e8ff] rounded-2xl p-3 text-center overflow-hidden">
            <p 
              className="font-mono text-[9px] text-[#94a3b8] uppercase tracking-wider mb-1"
              style={s.isNext ? { fontSize: 10, color: "#94a3b8", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" } : {}}
            >
              {s.label}
            </p>
            <p className="font-mono text-sm font-bold text-[#1a1a2e]">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Rules Preview */}
      <section>
        <div className="flex justify-between items-center mb-4 px-1">
          <h3 className="font-bold text-[#1a1a2e]">Active Rules</h3>
          <button type="button" onClick={() => setActiveTab("rules")} className="text-xs font-bold text-[#2563eb] flex items-center gap-0.5">
            See all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        
        {rules.filter(r => r.status === "active").length === 0 ? (
          <div className="bg-white border border-[#e0e8ff] border-dashed rounded-[24px] p-10 text-center space-y-3">
            <div className="w-12 h-12 bg-[#f0f4ff] rounded-full flex items-center justify-center mx-auto">
              <Zap className="w-6 h-6 text-[#2563eb]" />
            </div>
            <p className="text-sm text-[#94a3b8]">Create your first rule to start automating</p>
            <button 
              onClick={() => openBotForRule()}
              className="bg-[#2563eb] text-white px-6 py-2.5 rounded-full font-bold text-xs shadow-lg shadow-blue-100"
            >
              + Browse Templates
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.filter(r => r.status === "active").slice(0, 3).map((rule) => (
              <RuleCard key={rule.id} rule={rule} onToggle={() => toggleRule(rule)} />
            ))}
          </div>
        )}
      </section>

      {/* Activity Preview */}
      <section>
        <div className="flex justify-between items-center mb-4 px-1">
          <h3 className="font-bold text-[#1a1a2e]">Recent Activity</h3>
          <button type="button" onClick={() => setActiveTab("activity")} className="text-xs font-bold text-[#2563eb] flex items-center gap-0.5">
            All <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="bg-white border border-[#e0e8ff] rounded-[24px] overflow-hidden">
          {logs.length === 0 ? (
            <p className="text-sm text-[#94a3b8] p-8 text-center">No activity yet</p>
          ) : (
            <div className="divide-y divide-[#e0e8ff]">
              {logs.slice(0, 5).map((log) => (
                <div key={log.id} className="p-4 flex items-center justify-between hover:bg-[#f8faff] transition-colors">
                  <div className="flex items-center gap-3">
                    <StatusDot status={log.status} />
                    <div>
                      <p className="text-xs font-bold text-[#1a1a2e]">{log.rules?.name || "Rule"}</p>
                      <p className="font-mono text-[9px] text-[#94a3b8] uppercase">{relativeTime(log.executed_at)}</p>
                    </div>
                  </div>
                  {log.tx_hash && (
                    <a href={`https://${process.env.NEXT_PUBLIC_TON_NETWORK === 'testnet' ? 'testnet.' : ''}tonscan.org/${log.tx_hash.startsWith('U') || log.tx_hash.startsWith('E') ? 'address' : 'tx'}/${log.tx_hash}`} target="_blank" className="text-[#2563eb] hover:bg-blue-50 p-1.5 rounded-lg transition-all">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );

  const RulesTab = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-[#1a1a2e]">Automation Rules</h2>
        <button 
          onClick={() => openBotForRule()}
          className="bg-[#2563eb] text-white px-4 py-2 rounded-full font-bold text-xs"
        >
          + New
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="bg-white border border-[#e0e8ff] border-dashed rounded-[24px] p-20 text-center space-y-3">
          <p className="text-sm text-[#94a3b8]">You haven't added any rules yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.sort((a, b) => (a.status === "active" ? -1 : 1)).map((rule) => (
            <RuleCard 
              key={rule.id} 
              rule={rule} 
              onToggle={() => toggleRule(rule)} 
              extended 
              onDelete={() => setShowDeleteConfirm(rule.id)}
            />
          ))}
        </div>
      )}
    </div>
  );

  const ActivityTab = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-xl font-bold text-[#1a1a2e] mb-6">Execution Log</h2>
      <div className="bg-white border border-[#e0e8ff] rounded-[24px] overflow-hidden">
        {logs.length === 0 ? (
          <p className="text-sm text-[#94a3b8] p-20 text-center italic">Your execution history will appear here once your rules fire.</p>
        ) : (
          <div className="divide-y divide-[#e0e8ff]">
            {logs.map((log) => (
              <div key={log.id} className="p-5 flex items-center justify-between hover:bg-[#f8faff] transition-all">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl ${log.status === "success" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                    {log.status === "success" ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-[#1a1a2e]">{log.rules?.name || "Rule"}</p>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${log.status === "success" ? "bg-emerald-100/50 text-emerald-700" : "bg-rose-100/50 text-rose-700"}`}>
                        {log.status}
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-[#94a3b8] mt-1 uppercase tracking-tight">
                      {relativeTime(log.executed_at, true)}
                    </p>
                  </div>
                </div>
                {log.tx_hash && (
                  <a href={`https://${process.env.NEXT_PUBLIC_TON_NETWORK === 'testnet' ? 'testnet.' : ''}tonscan.org/${log.tx_hash.startsWith('U') || log.tx_hash.startsWith('E') ? 'address' : 'tx'}/${log.tx_hash}`} target="_blank" className="flex items-center gap-1 text-[#2563eb] font-mono text-[10px] font-bold">
                    View <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const SettingsTab = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-xl font-bold text-[#1a1a2e] mb-6">Dashboard Settings</h2>
      
      <div className="bg-white border border-[#e0e8ff] rounded-[24px] overflow-hidden">
        <div className="p-5 border-b border-[#e0e8ff]">
          <p className="font-mono text-[10px] text-[#94a3b8] uppercase mb-2">My Vault Address</p>
          <div className="flex items-center justify-between gap-3 p-3 bg-[#f8faff] border border-[#e0e8ff] rounded-2xl">
            <span className="font-mono text-xs font-bold text-[#1a1a2e] truncate">{walletAddress}</span>
            <button onClick={copyAddress} className="text-[#2563eb] p-1.5 hover:bg-white rounded-lg transition-all shadow-sm">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="divide-y divide-[#e0e8ff]">
          {[
            { label: "Network", val: "TON Testnet" },
            { label: "Active Rules", val: rules.filter(r => r.status === "active").length },
            { label: "Total Executions", val: logs.length }
          ].map((row, i) => (
            <div key={i} className="px-6 py-4 flex justify-between items-center">
              <span className="text-sm text-[#94a3b8]">{row.label}</span>
              <span className="font-mono text-xs font-bold text-[#1a1a2e]">{row.val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#e0e8ff] rounded-[24px] divide-y divide-[#e0e8ff]">
        <button 
          onClick={() => openBotForRule()}
          className="w-full px-6 py-5 flex justify-between items-center hover:bg-[#f8faff] transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#2563eb]">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-[#1a1a2e]">Browse Rule Templates</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#94a3b8] group-hover:translate-x-1 transition-transform" />
        </button>
        <button 
          onClick={() => userId && fetchData(userId)}
          className="w-full px-6 py-5 flex justify-between items-center hover:bg-[#f8faff] transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-600">
              <RefreshCw className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-[#1a1a2e]">Refresh Dashboard Data</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#94a3b8] group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      <footer className="text-center py-10 opacity-30">
        <p className="font-mono text-[9px] font-black tracking-widest text-[#1a1a2e] uppercase">
          TONPILOT · TESTNET · v0.1.0
        </p>
      </footer>
    </div>
  );

  // ── Main UI Structure ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen arctic-theme pb-32">
      <div className="max-w-md mx-auto p-5">
        {!userId && !loading ? (
          <div className="bg-white border border-rose-100 rounded-[32px] p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-500">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-[#1a1a2e]">Sync Error</h3>
            <p className="text-sm text-[#94a3b8] leading-relaxed">
              We couldn't detect your Telegram ID. Please make sure you are opening this from the official TonPilot bot.
            </p>
            
            <div className="flex flex-col gap-2 pt-2">
              <button 
                onClick={() => WebApp.close()}
                className="bg-slate-100 text-[#1a1a2e] px-8 py-3 rounded-full font-bold text-xs"
              >
                Back to Chat
              </button>
              
              <button 
                onClick={() => setShowManualLogin(!showManualLogin)}
                className="text-[10px] text-slate-300 hover:text-slate-400 underline"
              >
                Advanced Sync Diagnostics
              </button>
              
              {showManualLogin && (
                <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-in fade-in slide-in-from-top-2">
                  <p className="text-[10px] text-slate-400 mb-2 uppercase font-bold tracking-wider">Manual UID Sync</p>
                  <input 
                    type="text" 
                    placeholder="Enter your Telegram ID" 
                    value={manualUid}
                    onChange={(e) => setManualUid(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs mb-2 focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                  <button 
                    onClick={() => {
                      if (manualUid) {
                        setUserId(manualUid);
                        fetchData(manualUid);
                      }
                    }}
                    className="w-full bg-[#1a1a2e] text-white py-2 rounded-xl text-[10px] font-bold"
                  >
                    Force Sync
                  </button>
                </div>
              )}
            </div>
          </div>
        ) :
 !walletAddress && !loading ? (
          <div className="bg-white border border-blue-100 rounded-[32px] p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-500">
              <Zap className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-[#1a1a2e]">Create Your Vault</h3>
            <p className="text-sm text-[#94a3b8] leading-relaxed">
              It looks like you haven't set up your TonPilot vault yet. Head back to the bot to create your secure wallet.
            </p>
            <button 
              onClick={() => WebApp.close()}
              className="bg-[#2563eb] text-white px-8 py-3 rounded-full font-bold text-xs shadow-lg shadow-blue-100"
            >
              Go to Bot
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-6 animate-in fade-in duration-500">
            <Skeleton className="w-full h-48 rounded-[32px]" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </div>
            <div className="space-y-3">
              <Skeleton className="w-32 h-4 mb-2" />
              <Skeleton className="w-full h-24 rounded-[24px]" />
              <Skeleton className="w-full h-24 rounded-[24px]" />
            </div>
          </div>
        ) : (

          <>
            {activeTab === "home" && HomeTab()}
            {activeTab === "rules" && RulesTab()}
            {activeTab === "activity" && ActivityTab()}
            {activeTab === "settings" && SettingsTab()}
            {activeTab === "tokens" && TokensTab()}
          </>
        )}
      </div>

      {/* Scrollable Floating Action Button */}
      
      {/* Bottom Nav */}
      <nav className="fixed bottom-6 left-6 right-6 z-40">
        <div className="max-w-md mx-auto relative h-20 bg-white/80 backdrop-blur-2xl rounded-[32px] border border-blue-50/50 shadow-2xl shadow-blue-100 flex items-center justify-between px-4">
          <NavBtn id="home" icon={Home} label="Home" />
          <NavBtn id="rules" icon={List} label="Rules" />
          
          {/* Centered Tokens Button Positioning */}
          <div className="w-16 h-16 -mt-10 flex flex-col items-center justify-center relative">
            <button 
              type="button"
              onClick={() => setActiveTab("tokens")}
              className={`w-14 h-14 text-white rounded-full flex items-center justify-center shadow-xl mb-1 shadow-blue-300 active:scale-90 hover:scale-105 transition-all outline-none border-4 border-white ${activeTab === "tokens" ? "bg-blue-600 scale-105" : "bg-[#2563eb]"}`}
            >
              <Coins className="w-6 h-6" />
            </button>
            <span className={`text-[9px] font-bold uppercase tracking-tight absolute -bottom-5 ${activeTab === "tokens" ? "text-blue-600" : "text-slate-400"}`}>Tokens</span>
          </div>

          <NavBtn id="activity" icon={ActivityIcon} label="Activity" />
          <NavBtn id="settings" icon={SettingsIcon} label="Settings" />
        </div>
      </nav>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[32px] p-8 w-full max-w-xs shadow-2xl border border-rose-50"
            >
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-[#1a1a2e] text-center mb-2">Delete Rule?</h3>
              <p className="text-sm text-[#94a3b8] text-center mb-6 px-2">This action cannot be undone. All rule history will be maintained.</p>
              
              <div className="space-y-3">
                <button 
                  onClick={() => deleteRule(showDeleteConfirm)}
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3.5 rounded-2xl transition-colors shadow-lg shadow-rose-100"
                >
                  Yes, delete it
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="w-full bg-slate-50 hover:bg-slate-100 text-[#94a3b8] font-bold py-3.5 rounded-2xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Fund Modal Bottom Sheet */}
      <AnimatePresence>
        {showFund && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col justify-end bg-[#1a1a2e]/40 backdrop-blur-sm"
          >
            <div className="absolute inset-0" onClick={() => {
              setShowFund(false);
              setTonConnectStep("idle");
            }} />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="relative bg-white w-full rounded-t-[32px] p-6 pb-12 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-[#1a1a2e] mb-2">Fund Your Vault</h2>
              <p className="text-[#64748b] text-sm mb-6 leading-relaxed">
                Send TON to your vault address from any wallet (Tonkeeper, MyTonWallet, etc). Your balance updates automatically.
              </p>

              {tonConnectStep === "idle" && (
                <>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                    <TonConnectButton />
                  </div>
                  
                  {userWallet ? (
                    <button 
                      style={{
                        width: "100%", padding: "16px", background: "#2563eb", color: "#fff",
                        borderRadius: 14, border: "none", fontSize: 15, fontWeight: 700,
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        gap: 10, marginBottom: 16,
                      }}
                      onClick={handleTonConnect}
                    >
                      <ArrowDown className="w-5 h-5" /> Execute Deposit
                    </button>
                  ) : (
                    <p style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", fontFamily: "JetBrains Mono", marginBottom: 20 }}>
                      Connect your personal wallet above first
                    </p>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                    <div style={{ flex: 1, height: 1, background: "#e0e8ff" }} />
                    <span style={{ color: "#94a3b8", fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>OR MANUALLY</span>
                    <div style={{ flex: 1, height: 1, background: "#e0e8ff" }} />
                  </div>

                  <div className="bg-[#f8faff] border border-[#e0e8ff] rounded-2xl p-4 mb-4">
                    <p className="font-mono text-xs text-[#1a1a2e] break-all leading-loose tracking-tight select-all">
                      {walletAddress}
                    </p>
                    <button 
                      onClick={copyAddress}
                      className="mt-4 w-full flex items-center justify-center gap-2 bg-[#2563eb] text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition"
                    >
                      <Copy className="w-4 h-4" /> <span id="copy-btn-text">Copy Vault Address</span>
                    </button>
                  </div>

                  <button 
                    onClick={() => {
                      setShowFund(false);
                      setTonConnectStep("idle");
                    }}
                    className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-sm hover:bg-slate-200 transition mt-4"
                  >
                    Close
                  </button>
                </>
              )}

              {tonConnectStep === "amount" && (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", marginBottom: 8 }}>
                    How much TON to fund?
                  </div>
                  <input
                    type="number"
                    value={fundAmount}
                    onChange={e => setFundAmount(e.target.value)}
                    style={{
                      width: "100%", padding: "14px", border: "1px solid #e0e8ff",
                      borderRadius: 12, fontSize: 18, fontFamily: "JetBrains Mono",
                      color: "#1a1a2e", background: "#f0f4ff", textAlign: "center",
                      marginBottom: 8, outline: "none"
                    }}
                  />
                  <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginBottom: 16, fontFamily: "JetBrains Mono" }}>
                    ≈ ${(parseFloat(fundAmount || "0") * (price ?? 0)).toFixed(2)} USD
                  </div>
                  <button
                    style={{
                      width: "100%", padding: "14px", background: "#2563eb", color: "#fff",
                      borderRadius: 12, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer"
                    }}
                    onClick={async () => {
                      if (!userWallet || !walletAddress) return;
                      try {
                        const nanoAmount = Math.floor(parseFloat(fundAmount) * 1e9).toString();
                        await tonConnectUI.sendTransaction({
                          validUntil: Math.floor(Date.now() / 1000) + 300,
                          messages: [{ address: walletAddress, amount: nanoAmount }],
                        });
                        setTonConnectStep("success");
                      } catch (err) {
                        console.error(err);
                        alert("Transaction cancelled or failed.");
                      }
                    }}
                  >
                    Confirm in Wallet →
                  </button>
                  <button
                    style={{
                      width: "100%", padding: "10px", background: "none", border: "none",
                      color: "#94a3b8", fontSize: 13, cursor: "pointer", marginTop: 8
                    }}
                    onClick={() => setTonConnectStep("idle")}
                  >
                    ← Back
                  </button>
                </div>
              )}

              {tonConnectStep === "success" && (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", marginBottom: 8 }}>
                    Deposit Sent!
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", fontFamily: "JetBrains Mono", lineHeight: 1.6 }}>
                    Your vault balance will update automatically within 15-30 seconds once confirmed.
                  </div>
                  <button
                    style={{
                      marginTop: 20, width: "100%", padding: "12px", background: "#f0f4ff", border: "1px solid #e0e8ff",
                      borderRadius: 12, color: "#2563eb", fontSize: 13, fontWeight: 600, cursor: "pointer"
                    }}
                    onClick={() => {
                      setTonConnectStep("idle");
                      setShowFund(false);
                      if (userId) fetchData(userId);
                    }}
                  >
                    Done — Check My Balance
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Withdraw Modal Bottom Sheet */}
      <AnimatePresence>
        {showWithdraw && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col justify-end bg-[#1a1a2e]/40 backdrop-blur-sm"
          >
            <div className="absolute inset-0" onClick={() => {
              if(!withdrawing) setShowWithdraw(false);
            }} />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="relative bg-white w-full rounded-t-[32px] p-6 pb-12 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-[#1a1a2e] mb-6">Withdraw TON</h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-[#64748b] uppercase mb-1.5">Recipient Address</label>
                  <input 
                    type="text" 
                    placeholder="UQBx...f3d2"
                    value={withdrawAddress}
                    onChange={(e) => setWithdrawAddress(e.target.value)}
                    className="w-full bg-[#f8faff] border border-[#e0e8ff] focus:border-[#2563eb] rounded-xl px-4 py-3 outline-none transition font-mono text-sm"
                    disabled={withdrawing || withdrawSuccess}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#64748b] uppercase mb-1.5">Amount (TON)</label>
                  <input 
                    type="number" 
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full bg-[#f8faff] border border-[#e0e8ff] focus:border-[#2563eb] rounded-xl px-4 py-3 outline-none transition font-mono text-sm"
                    disabled={withdrawing || withdrawSuccess}
                  />
                  <div className="flex justify-between items-center mt-1.5">
                    <p className="text-xs text-[#94a3b8]">Available: {balance.toFixed(2)} TON</p>
                    <button 
                      onClick={() => setWithdrawAmount(balance.toString())}
                      className="text-[#2563eb] text-[10px] font-bold uppercase bg-blue-50 px-2 py-0.5 rounded-md"
                      disabled={withdrawing || withdrawSuccess}
                    >
                      Max
                    </button>
                  </div>
                </div>
              </div>

              {withdrawError && (
                <div className="bg-rose-50 text-rose-600 text-sm p-3 rounded-xl mb-4 font-medium flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0" /> {withdrawError}
                </div>
              )}

              {withdrawSuccess && (
                <div className="bg-emerald-50 text-emerald-600 text-sm p-3 rounded-xl mb-4 font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> Withdrawal sent!
                </div>
              )}

              <button 
                onClick={handleWithdraw}
                disabled={withdrawing || withdrawSuccess || !withdrawAddress || !withdrawAmount}
                className="w-full bg-[#2563eb] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 mb-4 shadow-lg shadow-blue-200"
              >
                {withdrawing ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending...</>
                ) : (
                  "Send Withdrawal"
                )}
              </button>

              <p className="text-center text-[#94a3b8] text-xs mb-6">
                Withdrawals are irreversible. Double-check the address before sending.
              </p>

              <button 
                onClick={() => setShowWithdraw(false)}
                disabled={withdrawing}
                className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-sm hover:bg-slate-200 transition disabled:opacity-50"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* Swap Modal */}
        {showSwap && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0a0f2c]/40 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-md shadow-2xl relative"
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden" />
              
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-[#1a1a2e]">Insta-Swap</h3>
                  <p className="text-sm text-[#94a3b8] mt-1">Swap TON to USDT instantly using TonPilot AI</p>
                </div>
                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-[#2563eb]">
                  <RefreshCw className="w-6 h-6" />
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-[#64748b] uppercase mb-1.5">You Pay (TON)</label>
                  <input 
                    type="number" 
                    placeholder="0.00"
                    value={swapAmount}
                    onChange={(e) => setSwapAmount(e.target.value)}
                    className="w-full bg-[#f8faff] border border-[#e0e8ff] focus:border-[#2563eb] rounded-xl px-4 py-4 outline-none transition font-mono text-lg font-bold text-[#1a1a2e]"
                    disabled={swapping}
                  />
                  <div className="flex justify-between items-center mt-1.5">
                    <p className="text-xs text-[#94a3b8]">Available to swap: {balance.toFixed(2)} TON</p>
                  </div>
                </div>
                
                <div className="flex justify-center -my-2 relative z-10">
                  <div className="bg-white p-2 rounded-full border border-blue-100 text-blue-500 shadow-sm">
                    <ArrowDown className="w-4 h-4" />
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <span className="block text-xs font-bold text-[#64748b] uppercase mb-1.5">You Receive (USDT)</span>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#009393] flex items-center justify-center">
                      <span className="text-white text-[8px] font-bold">USD₮</span>
                    </div>
                    <span className="text-lg font-mono font-bold text-[#1a1a2e] opacity-50">{(parseFloat(swapAmount || "0") * price).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={handleSwap}
                disabled={swapping || !swapAmount || Number(swapAmount) <= 0}
                className="w-full bg-[#2563eb] text-white py-4 rounded-xl font-bold text-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 mb-4 shadow-lg shadow-blue-200"
              >
                {swapping ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Swapping & Executing...</>
                ) : (
                  "Swap Now"
                )}
              </button>

              <button 
                onClick={() => setShowSwap(false)}
                disabled={swapping}
                className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-sm hover:bg-slate-200 transition disabled:opacity-50"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Shared Components ────────────────────────────────────────────────────────

function RuleCard({ rule, onToggle, onDelete, extended = false }: { rule: Rule, onToggle: () => void, onDelete?: () => void, extended?: boolean }) {
  const isSwap = rule.action.type === "swap";
  const isSend = rule.action.type === "send";
  const isActive = rule.status === "active";

  const getTheme = () => {
    if (isSwap) return { bg: "bg-blue-50/50", iconBg: "bg-blue-50 text-blue-600" };
    if (isSend) return { bg: "bg-emerald-50/50", iconBg: "bg-emerald-50 text-emerald-600" };
    return { bg: "bg-orange-50/50", iconBg: "bg-orange-50 text-orange-600" };
  };

  const theme = getTheme();

  const nextRunDisplay = (rule: Rule) => {
    if (!rule.next_run_at) return "—";
    const next = new Date(rule.next_run_at);
    const now = new Date();
    if (next <= now) return "updating...";
    
    // Also show the actual time for context
    const timeStr = next.toLocaleString("en-GB", {
      weekday: "short",
      hour: "2-digit", 
      minute: "2-digit",
      hour12: true
    });
    
    return `${nextRunText(rule.next_run_at)} · ${timeStr}`;
  };

  return (
    <div className={`bg-white border border-[#e0e8ff] rounded-[28px] p-5 shadow-sm transition-all hover:shadow-md hover:border-blue-100 group`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl ${theme.iconBg} transition-all group-hover:scale-110`}>
            {isSwap ? <RefreshCw className="w-5 h-5" /> : isSend ? <ArrowUpRight className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
          </div>
          <div>
            <h4 className="font-bold text-[#1a1a2e] mb-0.5 line-clamp-1">{rule.name}</h4>
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${isActive ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                {rule.status}
              </span>
              <span className="font-mono-jetbrains text-[9px] text-[#94a3b8] uppercase tracking-tight">#{rule.id.slice(0, 4)}</span>
            </div>
          </div>
        </div>
        
        {/* Toggle Switch */}
        <button 
          onClick={onToggle}
          className={`w-11 h-6 rounded-full relative transition-all duration-300 ${isActive ? 'bg-[#2563eb] text-white shadow-lg shadow-blue-100' : 'bg-[#e2e8f0]'}`}
        >
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${isActive ? 'left-6' : 'left-1'}`} />
        </button>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-start gap-2 text-xs text-[#1a1a2e]">
          <span className="text-[#94a3b8] font-mono-jetbrains text-[10px] uppercase w-14 pt-0.5">Action</span>
          <p className="font-medium bg-[#f8faff] px-2 py-1 rounded-lg flex-1">
            {isSwap 
              ? `Swap ${(rule.action as SwapAction).amount} ${(rule.action as SwapAction).fromAsset} → ${(rule.action as SwapAction).toAsset}` 
              : isSend 
                ? `Send ${(rule.action as SendAction).amount} ${(rule.action as SendAction).asset} to wallet` 
                : `Send notification`}
          </p>
        </div>
        <div className="flex items-start gap-2 text-xs text-[#1a1a2e]">
          <span className="text-[#94a3b8] font-mono-jetbrains text-[10px] uppercase w-14 pt-0.5">Trigger</span>
          <p className="font-medium text-[#1a1a2e]">
            {formatTriggerText(rule.trigger)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-50 pt-4 mt-2">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="font-mono-jetbrains text-[8px] text-[#94a3b8] uppercase">Next Run</span>
            <span className="font-mono-jetbrains text-[10px] font-bold text-[#1a1a2e]">{rule.status === "active" ? nextRunDisplay(rule) : "--"}</span>
          </div>
          {extended && (rule.streak_count > 0 || rule.run_count > 0) && (
            <div className="flex flex-col">
              <span className="font-mono-jetbrains text-[8px] text-[#94a3b8] uppercase">Stats</span>
              <span className="font-mono-jetbrains text-[10px] font-bold text-[#1a1a2e] flex items-center gap-1">
                {rule.run_count} total {rule.streak_count > 1 && <span className="text-orange-500 flex items-center gap-0.5"><Zap className="w-2.5 h-2.5 fill-orange-500" /> {rule.streak_count}</span>}
              </span>
            </div>
          )}
        </div>
        
        {onDelete && (
          <button 
            onClick={onDelete}
            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
