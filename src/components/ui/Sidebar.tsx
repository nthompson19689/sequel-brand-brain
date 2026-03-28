"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";

const navItems = [
  {
    name: "Chat",
    href: "/chat",
    shared: false,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.3 48.3 0 0 0 5.862-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
      </svg>
    ),
  },
  {
    name: "Agents",
    href: "/agents",
    shared: false,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
      </svg>
    ),
  },
  {
    name: "Content",
    href: "/content",
    shared: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
  {
    name: "Decks",
    href: "/decks",
    shared: false,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
  {
    name: "Outputs",
    href: "/outputs",
    shared: false,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
      </svg>
    ),
  },
  {
    name: "Brain",
    href: "/brain",
    shared: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { currentUser, setCurrentUser, allUsers, workspaces, currentWorkspace, switchWorkspace } = useWorkspace();
  const [wsOpen, setWsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  return (
    <aside className="w-60 bg-[#0F0A1A] text-[#A09CB0] flex flex-col h-screen fixed left-0 top-0 z-40">
      {/* Workspace switcher */}
      <div className="relative">
        <button
          onClick={() => { setWsOpen(!wsOpen); setUserOpen(false); }}
          className="w-full px-4 py-3.5 border-b border-[#2A2040] flex items-center gap-2.5 hover:bg-[#1A1228] transition-colors text-left"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
            style={{ backgroundColor: currentWorkspace?.color || "#7C3AED" }}
          >
            {currentWorkspace?.icon || "🏠"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{currentWorkspace?.name || "Workspace"}</p>
            <p className="text-[10px] text-[#6B6680] truncate">
              {currentWorkspace?.type === "team" ? "Team" : "Personal"}
            </p>
          </div>
          <svg className={`w-4 h-4 text-[#6B6680] transition-transform ${wsOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {/* Workspace dropdown */}
        {wsOpen && (
          <div className="absolute top-full left-0 w-full bg-[#1A1228] border-b border-[#2A2040] shadow-2xl z-50 max-h-[60vh] overflow-y-auto">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => { switchWorkspace(ws.id); setWsOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[#241C34] transition-colors ${
                  currentWorkspace?.id === ws.id ? "bg-[#241C34]" : ""
                }`}
              >
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0"
                  style={{ backgroundColor: ws.color }}
                >
                  {ws.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{ws.name}</p>
                  <p className="text-[10px] text-[#6B6680]">{ws.type === "team" ? "Team" : "Personal"}</p>
                </div>
                {currentWorkspace?.id === ws.id && (
                  <svg className="w-4 h-4 text-brand-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
            <Link
              href="/workspace/settings"
              onClick={() => setWsOpen(false)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[#241C34] transition-colors border-t border-[#2A2040]"
            >
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs bg-[#2A2040] text-[#A09CB0]">+</div>
              <span className="text-sm text-brand-400">Create Workspace</span>
            </Link>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* Section: Workspace tools */}
        <p className="px-3 pt-1 pb-2 text-[10px] font-semibold text-[#4A4560] uppercase tracking-wider">Workspace</p>
        {navItems.filter((i) => !i.shared).map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative ${
                isActive ? "bg-brand-500/15 text-white" : "text-[#A09CB0] hover:bg-[#1A1228] hover:text-white"
              }`}
            >
              {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-500 rounded-r-full" />}
              <span className={isActive ? "text-brand-400" : ""}>{item.icon}</span>
              {item.name}
            </Link>
          );
        })}

        {/* Section: Shared */}
        <p className="px-3 pt-4 pb-2 text-[10px] font-semibold text-[#4A4560] uppercase tracking-wider">Shared</p>
        {navItems.filter((i) => i.shared).map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative ${
                isActive ? "bg-brand-500/15 text-white" : "text-[#A09CB0] hover:bg-[#1A1228] hover:text-white"
              }`}
            >
              {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-500 rounded-r-full" />}
              <span className={isActive ? "text-brand-400" : ""}>{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User switcher at bottom */}
      <div className="relative border-t border-[#2A2040]">
        <button
          onClick={() => { setUserOpen(!userOpen); setWsOpen(false); }}
          className="w-full px-4 py-3 flex items-center gap-2.5 hover:bg-[#1A1228] transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-semibold">
            {currentUser.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium truncate">{currentUser.name}</p>
            <p className="text-[10px] text-[#6B6680] truncate">{currentUser.role}</p>
          </div>
        </button>

        {userOpen && (
          <div className="absolute bottom-full left-0 w-full bg-[#1A1228] border-t border-[#2A2040] shadow-2xl z-50">
            {allUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => { setCurrentUser(u); setUserOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[#241C34] transition-colors ${
                  currentUser.id === u.id ? "bg-[#241C34]" : ""
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-[10px] font-semibold">
                  {u.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{u.name}</p>
                  <p className="text-[10px] text-[#6B6680]">{u.role}</p>
                </div>
                {currentUser.id === u.id && (
                  <svg className="w-4 h-4 text-brand-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
