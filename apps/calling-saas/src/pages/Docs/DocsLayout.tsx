import { Link, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Rocket, Server, Activity, PhoneCall } from 'lucide-react';

const DOCS_NAV = [
  { path: '/docs', label: 'Overview', icon: <BookOpen size={18} /> },
  { path: '/docs/getting-started', label: 'Getting Started', icon: <Rocket size={18} /> },
  { path: '/docs/architecture', label: 'Architecture', icon: <Server size={18} /> },
];

export default function DocsLayout() {
  const location = useLocation();
  
  return (
    <div className="docs-shell min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Sidebar */}
      <div className="docs-sidebar w-64 h-screen border-r border-slate-200 bg-white flex flex-col p-4 fixed left-0 top-0">
        <div className="docs-brand flex items-center gap-3 px-2 mb-8 mt-2">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
            <PhoneCall size={18} className="text-white" />
          </div>
          <span className="auth-brand-copy font-bold text-xl tracking-tight text-slate-900">
            Jento<small>Voice Calling</small>
          </span>
        </div>
        
        <nav className="flex-1 flex flex-col gap-1">
          {DOCS_NAV.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/20 shadow-[inset_0_0_10px_rgba(99,102,241,0.1)]' 
                    : 'text-textMuted hover:text-text hover:bg-surface/50'
                }`}
              >
                {item.icon}
                <span className="font-medium text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border/50 pt-4">
          <Link
            to="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-textMuted hover:text-text hover:bg-surface/50 transition-colors"
          >
            <Activity size={18} />
            <span className="font-medium text-sm">Back to Home</span>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 ml-64 min-h-screen">
        <main className="max-w-4xl mx-auto px-10 py-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
