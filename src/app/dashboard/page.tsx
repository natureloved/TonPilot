"use client";

import { useState } from "react";
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
  Settings
} from "lucide-react";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("home");
  
  // Mock Data
  const balance = "1,245.50";
  const tonAmount = "245.12";
  
  const rules = [
    { id: 1, name: "DCA into TON", status: "active", description: "Buy 10 TON every Friday at 9 AM" },
    { id: 2, name: "Take Profit", status: "active", description: "Swap 50 TON to USDT if price > $7" },
    { id: 3, name: "Low Balance Alert", status: "paused", description: "Alert me if balance < 10 TON" },
  ];

  const activities = [
    { id: 1, type: "swap", text: "Swapped 10 TON to 55 USDT", time: "2 hours ago", status: "success" },
    { id: 2, type: "send", text: "Sent 5 TON to EQA...3f2a", time: "1 day ago", status: "success" },
    { id: 3, type: "alert", text: "Alert: TON price exceeded $6", time: "2 days ago", status: "success" },
    { id: 4, type: "swap", text: "Failed to swap 100 TON (insufficient balance)", time: "3 days ago", status: "failed" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#09090b] text-white font-sans">
      {/* Header */}
      <header className="px-6 pt-10 pb-4 flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-tight">TonPilot</h1>
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 p-[2px] shadow-lg shadow-blue-500/20">
          <div className="w-full h-full rounded-full bg-[#09090b] flex items-center justify-center">
            <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">TP</span>
          </div>
        </div>
      </header>

      {/* Main Content Scrollable */}
      <main className="flex-1 overflow-y-auto px-5 pb-28 space-y-8 no-scrollbar">
        
        {/* Vault Balance Card */}
        <section>
          <div className="relative overflow-hidden rounded-3xl p-6 shadow-2xl bg-gradient-to-br from-[#1c1c22] to-[#121217] border border-white/5">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <p className="text-sm text-gray-400 font-medium mb-1">Vault Balance</p>
              <h2 className="text-[2.5rem] leading-none font-black tracking-tight mb-3">${balance}</h2>
              <div className="flex items-center gap-2 text-[#0098EA] bg-[#0098EA]/10 border border-[#0098EA]/20 px-3 py-1.5 rounded-full text-sm font-semibold shadow-[0_0_15px_rgba(0,152,234,0.15)]">
                <Wallet className="w-4 h-4" />
                <span>{tonAmount} TON</span>
              </div>
            </div>
          </div>
        </section>

        {/* Active Rules List */}
        <section>
          <div className="flex justify-between items-end mb-4 px-1">
            <h3 className="text-lg font-bold">Active Rules</h3>
            <button className="text-sm text-[#0098EA] font-medium flex items-center gap-1 hover:text-blue-300 transition-colors">
              <Plus className="w-4 h-4" /> New Rule
            </button>
          </div>
          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} className="bg-[#18181c] border border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:bg-[#1f1f24] active:scale-[0.98] transition-all duration-200">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${rule.status === 'active' ? 'bg-[#0098EA]/10 text-[#0098EA]' : 'bg-gray-800 text-gray-400'}`}>
                    <Play className="w-4 h-4 ml-0.5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-100">{rule.name}</h4>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-1">{rule.description}</p>
                  </div>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${rule.status === 'active' ? 'bg-green-500 shadow-green-500/50' : 'bg-gray-600'}`}></div>
              </div>
            ))}
          </div>
        </section>

        {/* Activity Feed */}
        <section>
          <div className="flex justify-between items-end mb-4 px-1">
            <h3 className="text-lg font-bold">Recent Activity</h3>
            <button className="text-sm text-gray-500 font-medium hover:text-gray-300 transition-colors">View all</button>
          </div>
          <div className="bg-[#18181c] border border-white/5 rounded-3xl p-5">
            <div className="space-y-5">
              {activities.map((activity, index) => (
                <div key={activity.id} className={`flex gap-4 items-start ${index !== activities.length - 1 ? 'pb-5 border-b border-white/5 border-dashed' : ''}`}>
                  <div className="mt-0.5">
                    {activity.status === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 drop-shadow-[0_0_5px_rgba(34,197,94,0.3)]" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.3)]" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-200 leading-snug">{activity.text}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Clock className="w-3 h-3 text-gray-500" />
                      <span className="text-xs font-medium text-gray-500">{activity.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full bg-[#0d0d0f]/80 backdrop-blur-2xl border-t border-white/10 pb-6 pt-3 px-6 z-50">
        <div className="flex justify-between items-center max-w-md mx-auto">
          <NavItem icon={<Home className="w-6 h-6" />} label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <NavItem icon={<List className="w-6 h-6" />} label="Rules" active={activeTab === 'rules'} onClick={() => setActiveTab('rules')} />
          <NavItem icon={<Activity className="w-6 h-6" />} label="Activity" active={activeTab === 'activity'} onClick={() => setActiveTab('activity')} />
          <NavItem icon={<Settings className="w-6 h-6" />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${active ? 'text-[#0098EA]' : 'text-gray-500 hover:text-gray-400'}`}
    >
      <div className={`relative ${active ? 'scale-110' : 'scale-100'} transition-transform duration-300`}>
        {active && (
           <div className="absolute inset-0 bg-[#0098EA] blur-md opacity-30 rounded-full"></div>
        )}
        <div className="relative z-10">
          {icon}
        </div>
      </div>
      <span className="text-[10px] font-bold tracking-wide">{label}</span>
    </button>
  );
}
