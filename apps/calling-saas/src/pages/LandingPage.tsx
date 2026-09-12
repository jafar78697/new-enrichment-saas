import { Link } from 'react-router-dom';
import {
  Activity,
  CheckCircle,
  CreditCard,
  Globe2,
  Info,
  LogIn,
  PhoneCall,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import heroImage from '../assets/hero.png';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-text selection:bg-primary/30">
      <nav className="sticky top-0 z-30 border-b border-border/40 bg-background/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
              <Activity size={23} className="text-white" />
            </div>
            <span className="font-bold text-2xl tracking-tight text-white">JentoAI</span>
          </div>

          <div className="hidden md:flex items-center gap-7 text-sm text-textMuted">
            <a href="#calling" className="hover:text-white transition-colors">Calling</a>
            <Link to="/pricing" className="hover:text-white transition-colors">Billing</Link>
            <a href="#more-info" className="hover:text-white transition-colors">More Information</a>
          </div>

          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border/60 text-sm font-medium text-white hover:border-primary/60 transition-colors"
          >
            <LogIn size={17} />
            Login
          </Link>
        </div>
      </nav>

      <main>
        <section id="calling" className="relative overflow-hidden border-b border-border/40">
          <div className="max-w-7xl mx-auto px-6 py-16 lg:py-20 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/10 text-primary text-sm font-semibold mb-7">
                <Globe2 size={16} />
                USA & Canada cold calling system
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] text-white mb-6">
                AI calling agents for outbound sales teams.
              </h1>

              <p className="text-lg text-textMuted leading-8 max-w-2xl mb-8">
                Call prospects across the USA and Canada, build targeted Google Maps lead lists, and track every conversation from one focused workspace.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition-all shadow-[0_0_24px_rgba(99,102,241,0.35)]"
                >
                  Start Free Demo
                  <PhoneCall size={19} />
                </Link>
                <a
                  href="#more-info"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-surface border border-border/60 text-white font-semibold hover:border-secondary/60 transition-colors"
                >
                  <Info size={19} />
                  More Information
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                {[
                  '3 free demo calls',
                  '2 Maps keyword searches',
                  'Instant dashboard access',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-lg border border-border/50 bg-surface/35 px-3 py-2.5 text-sm text-textMuted">
                    <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="rounded-xl border border-border/60 bg-surface/40 p-5 shadow-2xl">
                <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-5">
                  <div>
                    <div className="text-sm text-textMuted">Live Call Console</div>
                    <div className="text-xl font-bold text-white mt-1">North America Campaign</div>
                  </div>
                  <div className="w-11 h-11 rounded-lg bg-primary/15 flex items-center justify-center">
                    <PhoneCall size={22} className="text-primary" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-5 items-center">
                  <img src={heroImage} alt="AI calling assistant preview" className="w-full h-auto rounded-lg bg-background/60 border border-border/40" />
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs text-textMuted mb-1">Caller Number</div>
                      <div className="font-mono text-white text-lg">+1 dedicated line</div>
                    </div>
                    <div>
                      <div className="text-xs text-textMuted mb-1">Demo Allowance</div>
                      <div className="h-2 rounded-full bg-background overflow-hidden">
                        <div className="h-full w-1/2 bg-emerald-400" />
                      </div>
                      <div className="text-xs text-textMuted mt-2">Free trial call preparation</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                  <div className="rounded-lg bg-background/50 border border-border/40 p-3">
                    <div className="text-xs text-textMuted">Region</div>
                    <div className="text-white font-semibold mt-1">US/CA</div>
                  </div>
                  <div className="rounded-lg bg-background/50 border border-border/40 p-3">
                    <div className="text-xs text-textMuted">Mode</div>
                    <div className="text-white font-semibold mt-1">AI Voice</div>
                  </div>
                  <div className="rounded-lg bg-background/50 border border-border/40 p-3">
                    <div className="text-xs text-textMuted">CRM</div>
                    <div className="text-white font-semibold mt-1">Included</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>


        <section id="more-info" className="max-w-7xl mx-auto px-6 py-16">
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 text-secondary font-semibold mb-4">
              <Sparkles size={18} />
              More Information
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-white">What happens after you start?</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                title: 'Create Your Account',
                text: 'Enter your name, email address, and password to open your private demo dashboard instantly.',
                icon: <ShieldCheck size={22} className="text-primary" />,
              },
              {
                title: 'Try Calling',
                text: 'Use the shared demo calling pool for up to three test calls to supported US destinations.',
                icon: <PhoneCall size={22} className="text-emerald-400" />,
              },
              {
                title: 'Upgrade',
                text: 'Choose your package, submit payment proof, and receive monthly calling access after admin approval.',
                icon: <CreditCard size={22} className="text-secondary" />,
              },
            ].map((item) => (
              <div key={item.title} className="glass-card p-6">
                <div className="w-11 h-11 rounded-lg bg-background/70 border border-border/50 flex items-center justify-center mb-5">
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                <p className="text-sm text-textMuted leading-6">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-xl border border-primary/30 bg-primary/10 p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div>
              <div className="font-semibold text-white">Ready to test JentoAI calling?</div>
              <div className="text-sm text-textMuted mt-1">Start demo access, then upgrade from the billing dashboard.</div>
            </div>
            <Link
              to="/signup"
              className="btn-primary inline-flex items-center justify-center gap-2"
            >
              Create Free Demo
              <PhoneCall size={18} />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
