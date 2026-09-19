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

export default function LandingPage() {
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
                <span /> Everything in rhythm
              </div>
              <h2>
                Tools that feel
                <br />
                <em>easy to use.</em>
              </h2>
            </div>
            <p>
              Small details add up: clean data, thoughtful calling tools and a
              dashboard that tells the truth quickly.
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
              <span /> The calm behind the numbers
            </div>
            <h2>
              When the workflow
              <br />
              <em>gets out of the way.</em>
            </h2>
            <p>
              Your team gets a sharper view of the day: who to call, what to say
              and what to do next.
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
              <strong>70%</strong>
              <span>less manual prep</span>
            </div>
            <div>
              <strong>100+</strong>
              <span>hours back each month</span>
            </div>
            <div>
              <strong>1</strong>
              <span>workspace for your team</span>
            </div>
          </div>
        </section>
        <section className="start-section" id="start">
          <div>
            <div className="landing-eyebrow">
              <span /> Ready to test Jento Calling?
            </div>
            <h2>
              Make your next
              <br />
              <em>call count.</em>
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
      <footer className="landing-footer">
        <span>Jento / Voice Calling</span>
        <span>Lead enrichment · Outreach · Growth</span>
      </footer>
    </div>
  );
}
