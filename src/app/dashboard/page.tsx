"use client";

import { useState, useEffect } from "react";
import WebApp from "@twa-dev/sdk";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { 
  Wallet, 
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Home,
  List,
  Activity,
  Settings,
  RefreshCw
} from "lucide-react";
import type { Rule } from "@/types";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("home");
  const [isReady, setIsReady] = useState(false);
  
  // Real Data State
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string>("Pilot");
  const [tonBalance, setTonBalance] = useState<number>(0);
  const [usdBalance, setUsdBalance] = useState<number>(0);
  const [rules, setRules] = useState<Rule[]>([]);
  const [activities, setActivities] = useState<any[]>([]); // Using any for logs since we don't fetch them yet

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
      try {
        // Fetch Rules and Wallet in parallel
        const [rulesRes, walletRes] = await Promise.all([
          fetch(`/api/rules?userId=${userId}`),
          fetch(`/api/wallet?userId=${userId}`)
        ]);

        if (rulesRes.ok) {
          const rulesData = await rulesRes.json();
          setRules(rulesData.rules);
        }

        if (walletRes.ok) {
          const walletData = await walletRes.json();
          setTonBalance(walletData.balance);
          setUsdBalance(walletData.usdValue);
        }
      } catch (err) {
        console.error("Failed to load live data", err);
      }
    };

    fetchDashboardData();
  }, [userId]);

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
                  <button className="text-sm text-[#0098EA] font-medium flex items-center gap-1 hover:text-blue-300 transition-colors bg-[#0098EA]/10 px-3 py-1.5 rounded-full">
                    <Plus className="w-3.5 h-3.5" /> New
                  </button>
                </div>
                
                {rules.length === 0 ? (
                  <div className="glass-panel p-6 text-center">
                    <p className="text-sm text-gray-400">No active rules yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rules.slice(0, 3).map((rule, idx) => (
                      <motion.div 
                        key={rule.id} 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + (idx * 0.1) }}
                        className="glass-panel p-4 flex items-center justify-between group hover:bg-white/5 cursor-pointer active:scale-[0.98] transition-all duration-300"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-11 h-11 rounded-[14px] flex items-center justify-center transition-all ${rule.status === 'active' ? 'bg-gradient-to-tr from-[#0098EA]/20 to-[#818CF8]/20 text-[#818CF8] shadow-[0_0_15px_rgba(0,152,234,0.2)]' : 'bg-gray-800/50 text-gray-500'}`}>
                            <Play className="w-5 h-5 ml-0.5" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-white truncate max-w-[180px]">{rule.name}</h4>
                            <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-wide">
                              {rule.trigger.type.replace("_", " ")}
                            </p>
                          </div>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${rule.status === 'active' ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]' : 'bg-gray-600'}`}></div>
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
                <div className="glass-panel p-5">
                   {activities.length === 0 ? (
                     <p className="text-sm text-gray-500 text-center py-4">No recent executions.</p>
                   ) : (
                     <div className="space-y-5">
                       {/* Activity list would go here */}
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
