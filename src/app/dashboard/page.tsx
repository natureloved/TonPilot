"use client";

import { useState, useEffect } from "react";
import WebApp from "@twa-dev/sdk";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Wallet, Play, CheckCircle2, XCircle, Clock, Plus, Home, List, Activity, Settings, RefreshCw, Power } from "lucide-react";
import type { Rule, ExecutionLog } from "@/types";
import { supabase } from "@/lib/supabase";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("home");
  const [isReady, setIsReady] = useState(false);
  
  // Real Data State
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string>("Pilot");
  const [tonBalance, setTonBalance] = useState<number>(0);
  const [usdBalance, setUsdBalance] = useState<number>(0);
  const [rules, setRules] = useState<Rule[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Initialize Telegram WebApp
    if (typeof window !== "undefined") {
      WebApp.ready();
      WebApp.expand(); // Make it full screen in Telegram
      
      const user = WebApp.initDataUnsafe?.user;
      if (user) {
        setUserId(user.id.toString());
        setFirstName(user.first_name);
      } else {
        // Fallback for local browser testing: hardcode your ID
        // setUserId("8633201368"); 
      }
    }
    
    setIsReady(true);
  }, []);

  // 2. Fetch Live Data when userId is available
  useEffect(() => {
    if (!userId) return;

    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch Rules, Wallet, and Logs
        const [rulesRes, walletRes, logsRes] = await Promise.all([
          supabase.from("rules").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
          fetch(`/api/wallet?userId=${userId}`),
          supabase.from("execution_logs").select("*, rules(name)").eq("user_id", userId).order("executed_at", { ascending: false }).limit(10)
        ]);

        if (rulesRes.data) {
          setRules(rulesRes.data as Rule[]);
        }

        if (walletRes.ok) {
          const walletData = await walletRes.json();
          setTonBalance(walletData.balance);
          setUsdBalance(walletData.usdValue);
        }

        if (logsRes.data) {
          setActivities(logsRes.data);
        }
      } catch (err) {
        console.error("Failed to load live data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [userId]);

  const toggleRule = async (ruleId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    
    // Optimistic update
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, status: newStatus } : r));

    const { error } = await supabase
      .from("rules")
      .update({ status: newStatus })
      .eq("id", ruleId);

    if (error) {
      console.error("Failed to toggle rule", error);
      // Revert on error
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, status: currentStatus } : r));
    }
  };

  // Framer Motion Variants
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  if (!isReady) {
    return <div className="min-h-screen bg-[#03040B] flex items-center justify-center">
      <RefreshCw className="w-8 h-8 text-[#0098EA] animate-spin" />
    </div>;
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <motion.header 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="px-6 pt-10 pb-4 flex justify-between items-center z-10"
      >
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">TonPilot</h1>
          <p className="text-sm text-gray-400">Welcome, {firstName}</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0098EA] to-[#818CF8] p-[2px] shadow-[0_0_20px_rgba(0,152,234,0.3)]">
          <div className="w-full h-full rounded-full bg-[#03040B] flex items-center justify-center">
            <span className="text-xs font-black text-gradient-primary">TP</span>
          </div>
        </div>
      </motion.header>

      {/* Main Content Scrollable */}
      <main className="flex-1 overflow-y-auto px-5 pb-28 no-scrollbar relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === "home" && (
            <motion.div 
              key="home"
              variants={containerVariants}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 mt-2"
            >
              
              {/* Vault Balance Card */}
              <motion.section variants={itemVariants}>
                <div className="relative overflow-hidden rounded-[32px] p-8 glass-panel border-t-white/10">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-ton-glow blur-[80px] -mr-20 -mt-20 pointer-events-none rounded-full"></div>
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/20 blur-[60px] -ml-16 -mb-16 pointer-events-none rounded-full"></div>
                  
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <p className="text-sm text-gray-400 font-medium mb-2 uppercase tracking-wider">Total Value</p>
                    <h2 className="text-5xl leading-none font-black tracking-tight mb-4 text-white">
                      ${usdBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h2>
                    <div className="flex items-center gap-2 bg-gradient-to-r from-[#0098EA]/20 to-[#818CF8]/20 border border-white/10 px-4 py-2 rounded-2xl text-sm font-semibold shadow-lg backdrop-blur-md">
                      <Wallet className="w-4 h-4 text-white" />
                      <span className="text-white">{tonBalance.toLocaleString()} TON</span>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Active Rules List */}
              <motion.section variants={itemVariants}>
                <div className="flex justify-between items-end mb-4 px-2">
                  <h3 className="text-lg font-bold text-white">Active Rules</h3>
                  <button 
                    onClick={() => window.location.href = '/dashboard/templates'}
                    className="text-sm text-[#0098EA] font-medium flex items-center gap-1 hover:text-blue-300 transition-colors bg-[#0098EA]/10 px-3 py-1.5 rounded-full"
                  >
                    <Plus className="w-3.5 h-3.5" /> New
                  </button>
                </div>
                
                {rules.length === 0 ? (
                  <div className="glass-panel p-8 text-center flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">No active rules yet.</p>
                      <button 
                        onClick={() => window.location.href = '/dashboard/templates'}
                        className="mt-4 text-xs bg-gradient-to-r from-[#0098EA] to-[#818CF8] text-white px-6 py-2.5 rounded-full font-bold shadow-lg"
                      >
                        + New Rule
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rules.map((rule, idx) => (
                      <motion.div 
                        key={rule.id} 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + (idx * 0.05) }}
                        className="glass-panel p-4 flex items-center justify-between group hover:bg-white/5 transition-all duration-300"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-11 h-11 rounded-[14px] flex items-center justify-center transition-all ${rule.status === 'active' ? 'bg-gradient-to-tr from-[#0098EA]/20 to-[#818CF8]/20 text-[#818CF8] shadow-[0_0_15px_rgba(0,152,234,0.2)]' : 'bg-gray-800/50 text-gray-500'}`}>
                            {rule.action.type === 'swap' ? <RefreshCw className="w-5 h-5" /> : rule.action.type === 'send' ? <Play className="w-5 h-5 ml-0.5 rotate-[-90deg]" /> : <CheckCircle2 className="w-5 h-5" />}
                          </div>
                          <div>
                            <h4 className="font-semibold text-white truncate max-w-[150px]">{rule.name}</h4>
                            <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">
                              {rule.trigger.type === 'schedule' ? `Every ${rule.trigger.cron}` : rule.trigger.type.replace("_", " ")}
                              {rule.next_run_at && rule.status === 'active' && ` • Next: ${formatTimeDist(new Date(rule.next_run_at))}`}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => toggleRule(rule.id, rule.status)}
                          className={`w-12 h-6 rounded-full relative transition-colors duration-300 flex items-center px-1 ${rule.status === 'active' ? 'bg-green-500/30 border border-green-500/50' : 'bg-white/10 border border-white/10'}`}
                        >
                          <motion.div 
                            animate={{ x: rule.status === 'active' ? 24 : 0 }}
                            className={`w-4 h-4 rounded-full shadow-md ${rule.status === 'active' ? 'bg-green-400' : 'bg-gray-500'}`}
                          />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.section>

              {/* Activity Feed Placeholder */}
              <motion.section variants={itemVariants}>
                <div className="flex justify-between items-end mb-4 px-2">
                  <h3 className="text-lg font-bold text-white">Recent Logs</h3>
                </div>
                <div className="glass-panel p-0 overflow-hidden">
                   {activities.length === 0 ? (
                     <p className="text-sm text-gray-500 text-center py-10 italic">No recent executions.</p>
                   ) : (
                     <div className="divide-y divide-white/5">
                       {activities.map((log: ExecutionLog & { rules: { name: string } }, idx: number) => (
                         <div key={log.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                           <div className="flex items-center gap-3">
                             <div className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]' : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]'}`}></div>
                             <div>
                               <p className="text-sm font-medium text-white">{log.rules?.name || "Unknown Rule"}</p>
                               <p className="text-[10px] text-gray-500">
                                 {formatTimeDist(new Date(log.executed_at))}
                               </p>
                             </div>
                           </div>
                           {log.tx_hash ? (
                             <a 
                               href={`https://testnet.tonscan.org/tx/${log.tx_hash}`} 
                               target="_blank" 
                               rel="noopener noreferrer"
                               className="text-[10px] font-bold text-[#0098EA] hover:text-blue-300 flex items-center gap-1"
                             >
                               View tx <Plus className="w-2.5 h-2.5 rotate-45" />
                             </a>
                           ) : log.error_message ? (
                             <span className="text-[10px] text-red-400/80 truncate max-w-[100px] italic">{log.error_message}</span>
                           ) : null}
                         </div>
                       ))}
                     </div>
                   )}
                </div>
              </motion.section>
              
            </motion.div>
          )}

          {activeTab !== "home" && (
            <motion.div 
              key="other"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel p-10 flex flex-col items-center justify-center text-center mt-10"
            >
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Settings className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2 capitalize">{activeTab} View</h3>
              <p className="text-sm text-gray-400">This section is currently under construction.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <motion.nav 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="fixed bottom-0 w-full glass-nav pb-6 pt-4 px-6 z-50 rounded-t-3xl"
      >
        <div className="flex justify-between items-center max-w-md mx-auto relative">
          <NavItem icon={<Home className="w-[22px] h-[22px]" />} label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <NavItem icon={<List className="w-[22px] h-[22px]" />} label="Rules" active={activeTab === 'rules'} onClick={() => setActiveTab('rules')} />
          
          {/* Central FAB */}
          <div className="relative -top-6">
            <button className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#0098EA] to-[#818CF8] shadow-[0_10px_30px_rgba(0,152,234,0.4)] flex items-center justify-center active:scale-90 transition-transform">
              <Plus className="w-6 h-6 text-white" />
            </button>
          </div>

          <NavItem icon={<Activity className="w-[22px] h-[22px]" />} label="Activity" active={activeTab === 'activity'} onClick={() => setActiveTab('activity')} />
          <NavItem icon={<Settings className="w-[22px] h-[22px]" />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </motion.nav>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${active ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
    >
      <div className={`relative p-2 rounded-xl transition-all duration-300 ${active ? 'bg-white/10 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : ''}`}>
        {icon}
      </div>
      <span className={`text-[10px] font-semibold tracking-wide ${active ? 'opacity-100' : 'opacity-0 -translate-y-2'} transition-all duration-300 absolute -bottom-4`}>
        {label}
      </span>
    </button>
  );
}

function formatTimeDist(date: Date): string {
  const now = new Date();
  const diffMs = Math.abs(date.getTime() - now.getTime());
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const suffix = date.getTime() > now.getTime() ? "" : " ago";
  const prefix = date.getTime() > now.getTime() ? "in " : "";

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${prefix}${diffMins}m${suffix}`;
  if (diffHours < 24) return `${prefix}${diffHours}h${suffix}`;
  if (diffDays === 1) return date.getTime() > now.getTime() ? "tomorrow" : "yesterday";
  return `${prefix}${diffDays}d${suffix}`;
}
