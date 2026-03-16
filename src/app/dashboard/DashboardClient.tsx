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
  Zap
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Rule, ExecutionLog, SwapAction, SendAction, ScheduleTrigger } from "@/types";

// ── Types & Helpers ──────────────────────────────────────────────────────────

type Tab = "home" | "rules" | "activity" | "settings";

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

const truncateAddr = (addr: string) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "None";

// ── Components ───────────────────────────────────────────────────────────────

export default function ArcticDashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Initialize & Fetch Data
  const fetchData = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      // 1. Get Wallet Address from Supabase
      const { data: user } = await supabase
        .from("users")
        .select("wallet_address")
        .eq("id", uid)
        .single();
      
      if (user?.wallet_address) {
        setWalletAddress(user.wallet_address);
        
        // 2. Fetch Balance & Price from our new API routes
        const [balRes, priceRes] = await Promise.all([
          fetch(`/api/wallet?address=${user.wallet_address}`),
          fetch(`/api/wallet/price`)
        ]);
        
        const balData = await balRes.json();
        const priceData = await priceRes.json();
        
        if (balData.balance !== undefined) setBalance(balData.balance);
        if (priceData.price !== undefined) setPrice(priceData.price);
      }

      // 3. Fetch Rules
      const { data: rulesData } = await supabase
        .from("rules")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      
      if (rulesData) setRules(rulesData);

      // 4. Fetch Logs
      const { data: logsData } = await supabase
        .from("execution_logs")
        .select("*, rules(name)")
        .eq("user_id", uid)
        .order("executed_at", { ascending: false })
        .limit(20);
      
      if (logsData) setLogs(logsData);

    } catch (err) {
      console.error("Dashboard Init Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      try {
        const tg = WebApp;
        if (tg && typeof tg.ready === 'function') {
          tg.ready();
          tg.expand();
          
          const user = tg.initDataUnsafe?.user;
          if (user) {
            setUserId(user.id.toString());
            fetchData(user.id.toString());
          }
        }
      } catch (e) {
        console.error("WebApp Init Error:", e);
      }
    }
  }, [fetchData]);

  if (!mounted) return null;

  const toggleRule = async (rule: Rule) => {
    const newStatus = rule.status === "active" ? "paused" : "active";
    // Optimistic update
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: newStatus } : r));

    const { error } = await supabase
      .from("rules")
      .update({ status: newStatus })
      .eq("id", rule.id);

    if (error) {
      console.error("Toggle error:", error);
      // Revert
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: rule.status } : r));
    }
  };

  const deleteRule = async (id: string) => {
    const { error } = await supabase
      .from("rules")
      .delete()
      .eq("id", id);
    
    if (!error) {
      setRules(prev => prev.filter(r => r.id !== id));
      setShowDeleteConfirm(null);
    }
  };

  const copyAddress = () => {
    if (walletAddress && typeof window !== "undefined") {
      navigator.clipboard.writeText(walletAddress);
      if (WebApp?.HapticFeedback) {
        WebApp.HapticFeedback.notificationOccurred("success");
      }
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
            <button className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl py-3 font-mono text-xs font-bold transition-all flex items-center justify-center gap-2">
              <ArrowDownLeft className="w-4 h-4" /> Fund
            </button>
            <button className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl py-3 font-mono text-xs font-bold transition-all flex items-center justify-center gap-2">
              <ArrowUpRight className="w-4 h-4" /> Withdraw
            </button>
            <button className="w-12 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl py-3 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active", val: rules.filter(r => r.status === "active").length },
          { label: "Done", val: logs.filter(l => l.status === "success").length },
          { label: "Next", val: rules.find(r => r.status === "active")?.next_run_at ? formatRelativeTime(rules.find(r => r.status === "active")!.next_run_at!) : "None" }
        ].map((s, i) => (
          <div key={i} className="bg-white border border-[#e0e8ff] rounded-2xl p-3 text-center">
            <p className="font-mono text-[9px] text-[#94a3b8] uppercase tracking-wider mb-1">{s.label}</p>
            <p className="font-mono text-sm font-bold text-[#1a1a2e]">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Rules Preview */}
      <section>
        <div className="flex justify-between items-center mb-4 px-1">
          <h3 className="font-bold text-[#1a1a2e]">Active Rules</h3>
          <button onClick={() => setActiveTab("rules")} className="text-xs font-bold text-[#2563eb] flex items-center gap-0.5">
            See all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        
        {rules.length === 0 ? (
          <div className="bg-white border border-[#e0e8ff] border-dashed rounded-[24px] p-10 text-center space-y-3">
            <div className="w-12 h-12 bg-[#f0f4ff] rounded-full flex items-center justify-center mx-auto">
              <Zap className="w-6 h-6 text-[#2563eb]" />
            </div>
            <p className="text-sm text-[#94a3b8]">Create your first rule to start automating</p>
            <button 
              onClick={() => router.push("/dashboard/templates")}
              className="bg-[#2563eb] text-white px-6 py-2.5 rounded-full font-bold text-xs shadow-lg shadow-blue-100"
            >
              + Create Rule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.slice(0, 3).map((rule) => (
              <RuleCard key={rule.id} rule={rule} onToggle={() => toggleRule(rule)} />
            ))}
          </div>
        )}
      </section>

      {/* Activity Preview */}
      <section>
        <div className="flex justify-between items-center mb-4 px-1">
          <h3 className="font-bold text-[#1a1a2e]">Recent Activity</h3>
          <button onClick={() => setActiveTab("activity")} className="text-xs font-bold text-[#2563eb] flex items-center gap-0.5">
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
                      <p className="font-mono text-[9px] text-[#94a3b8] uppercase">{formatRelativeTime(log.executed_at)}</p>
                    </div>
                  </div>
                  {log.tx_hash && (
                    <a href={`https://testnet.tonscan.org/tx/${log.tx_hash}`} target="_blank" className="text-[#2563eb] hover:bg-blue-50 p-1.5 rounded-lg transition-all">
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
          onClick={() => router.push("/dashboard/templates")}
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
          {rules.map((rule) => (
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
                      {new Date(log.executed_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
                {log.tx_hash && (
                  <a href={`https://testnet.tonscan.org/tx/${log.tx_hash}`} target="_blank" className="flex items-center gap-1 text-[#2563eb] font-mono text-[10px] font-bold">
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
          onClick={() => router.push("/dashboard/templates")}
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
        {loading ? (
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
          </>
        )}
      </div>

      {/* Scrollable Floating Action Button */}
      {(activeTab === "home" || activeTab === "rules") && !loading && (
        <button 
          onClick={() => router.push("/dashboard/templates")}
          className="fixed right-6 bottom-28 w-14 h-14 bg-[#2563eb] text-white rounded-full flex items-center justify-center shadow-2xl shadow-blue-400 z-50 active:scale-90 transition-transform"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 w-full bg-white border-t border-[#e0e8ff] px-6 py-4 flex justify-between items-center z-50 rounded-t-[32px]">
        {[
          { id: "home", icon: Home, label: "Home" },
          { id: "rules", icon: List, label: "Rules" },
          { id: "bottom_fab", type: "fab" }, // Gap for design style if needed
          { id: "activity", icon: ActivityIcon, label: "Activity" },
          { id: "settings", icon: SettingsIcon, label: "Settings" }
        ].map((t) => {
          if (t.type === "fab") return <div key="gap" className="w-2" />;
          const Icon = t.icon!;
          const isActive = activeTab === t.id;
          return (
            <button 
              key={t.id} 
              onClick={() => setActiveTab(t.id as Tab)}
              className="flex flex-col items-center gap-1.5 transition-all outline-none"
            >
              <div className={`p-2 rounded-2xl transition-all ${isActive ? 'bg-[#f0f4ff] text-[#2563eb] shadow-sm' : 'text-[#94a3b8] hover:bg-slate-50'}`}>
                <Icon className={`w-5 h-5 transition-all ${isActive ? 'scale-110' : ''}`} />
              </div>
              <span className={`font-mono text-[9px] font-bold uppercase tracking-tight transition-all ${isActive ? 'text-[#2563eb] opacity-100' : 'text-[#94a3b8] opacity-100'}`}>
                {t.label}
              </span>
            </button>
          );
        })}
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
            {rule.trigger.type === "schedule" 
              ? `Every ${(rule.trigger as ScheduleTrigger).cron}` 
              : `When price ${rule.trigger.type === "price_above" ? "crosses above" : "drops below"} threshold`}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-50 pt-4 mt-2">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="font-mono-jetbrains text-[8px] text-[#94a3b8] uppercase">Next Run</span>
            <span className="font-mono-jetbrains text-[10px] font-bold text-[#1a1a2e]">{rule.status === "active" && rule.next_run_at ? formatRelativeTime(rule.next_run_at) : "--"}</span>
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
