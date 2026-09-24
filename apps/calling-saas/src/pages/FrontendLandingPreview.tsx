import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  Menu,
  Phone,
  PhoneCall,
  Search,
  Users,
  X,
} from "lucide-react";
import "./frontend-landing-preview.css";

const cards = [
  {
    icon: Search,
    number: "01",
    title: "Find the right people.",
    text: "Turn a simple search into a clean, ready-to-call lead list.",
    color: "blue",
  },
  {
    icon: PhoneCall,
    number: "02",
    title: "Make every call count.",
    text: "Call, take notes and plan your next follow-up in one place.",
    color: "green",
  },
  {
    icon: BarChart3,
    number: "03",
    title: "See what is working.",
    text: "Track activity, talk time and outcomes without spreadsheet work.",
    color: "orange",
  },
];

export default function FrontendLandingPreview() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCard, setActiveCard] = useState(0);
  const navigate = useNavigate();
  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  return (
    <div className="landing-preview">
      <nav className="landing-nav">
        <button className="landing-brand" onClick={() => go("home-preview")}>
          <span className="landing-mark">
            <PhoneCall size={18} />
          </span>
          <span>
            Jento
            <small>Voice Calling</small>
          </span>
        </button>
        <div className={`landing-links ${menuOpen ? "open" : ""}`}>
          <button onClick={() => go("workflow")}>How it works</button>
          <button onClick={() => go("features")}>Features</button>
          <button onClick={() => go("results")}>Results</button>
          <Link to="/pricing">Pricing</Link>
          <button
            className="nav-mobile-close"
            onClick={() => setMenuOpen(false)}
          >
            <X size={19} />
          </button>
        </div>
        <div className="landing-nav-actions">
          <Link to="/login" className="text-button">
            Sign in
          </Link>
          <Link to="/signup" className="nav-cta">
            Get started <ArrowUpRight size={15} />
          </Link>
        </div>
        <button
          className="landing-menu"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={22} />
        </button>
      </nav>
      <main id="home-preview">
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="landing-eyebrow">
              <span /> USA & CANADA COLD CALLING SYSTEM
            </div>
            <h1>
              Enterprise Voice calling platform
              <br />
              <em>for outbound sales teams.</em>
            </h1>
            <p>
              Call prospects across the USA and Canada, build targeted Google
              Maps lead lists, and track every conversation from one focused
              workspace.
            </p>
            <div className="hero-actions">
              <button className="landing-primary" onClick={() => go("start")}>
                Start Free Demo <ArrowRight size={17} />
              </button>
              <button
                className="landing-secondary"
                onClick={() => go("workflow")}
              >
                See how it works <ArrowRight size={16} />
              </button>
            </div>
            <div className="hero-proof">
              <div className="proof-faces">
                <span>3</span>
                <span>2</span>
                <span>✓</span>
              </div>
              <div>
                <strong>3 free demo calls & 2 Maps searches</strong>
                <small>Instant dashboard access</small>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-top">
              <span className="tiny-dot" /> Live Call Console{" "}
              <span className="visual-time">North America Campaign</span>
            </div>
            <div className="visual-head">
              <div>
                <small>CALLER NUMBER</small>
                <strong>+1 dedicated line</strong>
              </div>
              <span className="visual-score">US/CA Live Voice</span>
            </div>
            <div className="visual-chart">
              <div className="chart-labels">
                <span>100</span>
                <span>75</span>
                <span>50</span>
                <span>25</span>
                <span>0</span>
              </div>
              <div className="hero-bars">
                {[38, 58, 47, 76, 66, 91, 80].map((height, i) => (
                  <div className="hero-bar-group" key={i}>
                    <i style={{ height: `${height}%` }} />
                    <b style={{ height: `${height * 0.62}%` }} />
                    <small>{["M", "T", "W", "T", "F", "S", "S"][i]}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="visual-bottom">
              <div>
                <span className="mini-icon blue">
                  <Users size={14} />
                </span>
                <span>
                  <small>Demo Allowance</small>
                  <strong>50% Available</strong>
                </span>
              </div>
              <div>
                <span className="mini-icon orange">
                  <Phone size={14} />
                </span>
                <span>
                  <small>CRM</small>
                  <strong>Included</strong>
                </span>
              </div>
            </div>
            <div className="visual-float">
              <Check size={14} /> Ready to test
            </div>
          </div>
        </section>

        <section className="landing-section" style={{ padding: '64px 24px', display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: '100%',
            maxWidth: '900px',
            aspectRatio: '16/9',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
            background: '#1e293b'
          }}>
            <iframe
              width="100%"
              height="100%"
              src="https://www.youtube.com/embed/WMafaouAjQo?autoplay=0&rel=0"
              title="Calling Google Leads - Team Management"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            ></iframe>
          </div>
        </section>

        <section className="logo-strip">
          <span>
            One workspace for the work behind every good conversation.
          </span>
          <div>
            <b>LEAD DATA</b>
            <b>OUTREACH</b>
            <b>CALLING</b>
            <b>INSIGHTS</b>
          </div>
        </section>
        <section className="landing-section" id="workflow">
          <div className="section-intro">
            <div>
              <div className="landing-eyebrow">
                <span /> Getting Started
              </div>
              <h2>
                What happens after
                <br />
                <em>you start?</em>
              </h2>
            </div>
            <p>
              Start demo access instantly, then upgrade from the billing
              dashboard when you are ready to scale.
            </p>
          </div>
          <div className="steps">
            <div className="step active">
              <span>01</span>
              <strong>Create Your Account</strong>
              <p>
                Enter your name, email address, and password to open your
                private demo dashboard instantly.
              </p>
              <ArrowRight size={18} />
            </div>
            <div className="step">
              <span>02</span>
              <strong>Try Calling</strong>
              <p>
                Use the shared demo calling pool for up to three test calls to
                supported US destinations.
              </p>
              <ArrowRight size={18} />
            </div>
            <div className="step">
              <span>03</span>
              <strong>Upgrade</strong>
              <p>
                Choose your package, submit payment proof, and receive monthly
                calling access after admin approval.
              </p>
              <ArrowRight size={18} />
            </div>
          </div>
        </section>
        <section className="landing-section feature-section" id="features">
          <div className="section-intro compact">
            <div>
              <div className="landing-eyebrow">
                <span /> More Information
              </div>
              <h2>
                What happens after
                <br />
                <em>you start?</em>
              </h2>
            </div>
            <p>
              Enter your details, use the shared demo calling pool, and upgrade when you are ready to scale.
            </p>
          </div>
          <div className="feature-grid">
            {cards.map(({ icon: Icon, number, title, text, color }, i) => (
              <button
                key={title}
                className={`feature-card ${color} ${activeCard === i ? "selected" : ""}`}
                onClick={() => setActiveCard(i)}
              >
                <div className="feature-icon">
                  <Icon size={27} />
                </div>
                <span className="feature-number">{number} / FEATURE</span>
                <h3>{title}</h3>
                <p>{text}</p>
                <span className="feature-link">
                  Explore feature <ArrowUpRight size={16} />
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="result-section" id="results">
          <div className="result-copy">
            <div className="landing-eyebrow">
              <span /> Live Call Console
            </div>
            <h2>
              Track every conversation
              <br />
              <em>from one focused workspace.</em>
            </h2>
            <p>
              Monitor active campaigns, dialers, and live voice interactions instantly.
            </p>
            <button
              className="landing-secondary light"
              onClick={() => navigate("/signup")}
            >
              Explore the workspace <ArrowRight size={17} />
            </button>
          </div>
          <div className="result-stats">
            <div>
              <strong>3</strong>
              <span>free demo calls</span>
            </div>
            <div>
              <strong>2</strong>
              <span>Maps keyword searches</span>
            </div>
            <div>
              <strong>1</strong>
              <span>workspace</span>
            </div>
          </div>
        </section>
        <section className="start-section" id="start">
          <div>
            <div className="landing-eyebrow">
              <span /> Ready to test Jento Calling?
            </div>
            <h2>
              Start demo access,
              <br />
              <em>then upgrade.</em>
            </h2>
            <p>Start with a clean workspace and 3 free demo calls.</p>
          </div>
          <Link
            to="/signup"
            className="landing-primary white"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Create Free Demo <ArrowRight size={17} />
          </Link>
        </section>
      </main>
      <footer style={{
        background: '#0f172a',
        color: '#fff',
        padding: '72px max(28px, calc((100% - 1184px) / 2)) 0',
      }}>
        {/* Main footer grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 48,
          paddingBottom: 48,
          borderBottom: '1px solid #1e293b',
        }}>
          {/* Brand column */}
          <div style={{ maxWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 11,
                background: '#2563eb', color: '#fff',
                display: 'grid', placeItems: 'center',
                fontSize: 15, fontWeight: 800,
                boxShadow: '0 7px 16px #2563eb35',
              }}>J</div>
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -1 }}>
                Jento<span style={{ color: '#60a5fa', fontWeight: 400 }}> Calling System</span>
              </span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.7, margin: '0 0 20px' }}>
              Your complete sales acceleration platform — lead enrichment, voice calling, and outreach automation in one place.
            </p>
          </div>

          {/* Product links */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20 }}>Product</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Link to="/login" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Login</Link>
              <Link to="/signup" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Create Account</Link>
              <Link to="/demo" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Free Demo</Link>
            </div>
          </div>

          {/* Features */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20 }}>Features</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>Lead Scraping</span>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>Browser Calling</span>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>Call Recording</span>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>Team Management</span>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>CRM Pipeline</span>
            </div>
          </div>

          {/* Resources & Support */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20 }}>Resources</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>support@jentoai.pro</span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '24px 0 28px',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <span style={{ color: '#475569', fontSize: 11 }}>© {new Date().getFullYear()} Jento Calling System. All rights reserved.</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ color: '#475569', fontSize: 11 }}>Lead enrichment · Outreach · Growth</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
