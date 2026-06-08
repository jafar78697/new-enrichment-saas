import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const topNav = [
  { href: '#services', label: 'Services' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#why-us', label: 'Why Us' },
];

const featureCards = [
  {
    eyebrow: 'YouTube Automation',
    title: 'Cash Cow & Faceless Channels',
    description:
      'We build, manage, and scale profitable YouTube channels for you. From scriptwriting and voiceovers to editing and SEO, we handle the entire process.',
  },
  {
    eyebrow: 'Facebook & Instagram',
    title: 'Automated Lead Gen & DM Funnels',
    description:
      'Turn followers into clients automatically. We build advanced DM funnels and automated chat systems to capture leads while you sleep.',
  },
  {
    eyebrow: 'Email Outreach',
    title: 'Cold Email & B2B Automation',
    description:
      'Consistent lead generation with automated cold email campaigns. We handle domain setup, list building, and personalized AI outreach at scale.',
  },
  {
    eyebrow: 'Recruitment Automation',
    title: 'Streamline Your Hiring',
    description:
      'Find the best talent without the manual work. We automate the sourcing, screening, and interview scheduling process to build your dream team faster.',
  },
  {
    eyebrow: 'GoHighLevel (GHL)',
    title: 'All-In-One CRM Setup',
    description:
      'We are GHL experts. We build customized workflows, pipelines, and automated follow-up sequences to manage your entire client lifecycle.',
  },
];

const workflowSteps = [
  {
    title: '1. Discovery & Strategy',
    description: 'We analyze your business, identify bottlenecks, and design a custom automation strategy tailored to your goals.',
  },
  {
    title: '2. System Buildout',
    description: 'Our team constructs the automation architecture, integrating CRMs, social channels, and AI tools seamlessly.',
  },
  {
    title: '3. Launch & Scale',
    description: 'We go live, monitor performance closely, and continuously optimize the systems to maximize your ROI.',
  },
];

const statCards = [
  { value: '24/7', label: 'Automated Lead Generation' },
  { value: '10x', label: 'Faster Response Times' },
  { value: '100%', label: 'Done-For-You Services' },
];

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div style={{ maxWidth: 620 }}>
      <p className="landing-eyebrow">{eyebrow}</p>
      <h2 className="landing-section-title">{title}</h2>
      <p className="landing-section-copy">{description}</p>
    </div>
  );
}

export default function LandingPage() {
  const { token } = useAuth();

  return (
    <div className="landing-shell">
      <div className="landing-orb landing-orb-left" />
      <div className="landing-orb landing-orb-right" />

      <header className="landing-topbar">
        <div className="landing-topbar-inner">
          <Link to="/" className="landing-brand">
            <img src="/favicon.png" alt="Jento AI" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
            <span className="landing-brand-copy">
              <strong>Jento AI</strong>
              <small>Automation Agency</small>
            </span>
          </Link>

          <nav className="landing-nav">
            {topNav.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="landing-actions">
            <Link to="/login" className="landing-link-button">
              Client Login
            </Link>
            <a href="#contact" className="landing-primary-button">
              Book a Call
            </a>
          </div>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Done-For-You Automation Services</p>
            <h1 className="landing-hero-title">
              Automate Your Business. Scale Without Limits.
            </h1>
            <p className="landing-hero-text">
              From YouTube Cash Cow channels to GoHighLevel CRM workflows, we build advanced automation systems that generate leads, close sales, and save you hundreds of hours.
            </p>

            <div className="landing-cta-row">
              <a href="#contact" className="landing-primary-button">
                Get a Custom Strategy
              </a>
              <a href="#services" className="landing-secondary-button">
                Explore Services
              </a>
            </div>

            <div className="landing-stat-grid">
              {statCards.map((item) => (
                <div key={item.value} className="landing-stat-card">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="landing-hero-panel">
            <div className="landing-panel-card landing-panel-card-main">
              <div className="landing-panel-label-row">
                <span className="landing-panel-label">Automation Impact</span>
                <span className="landing-panel-pill">Active Systems</span>
              </div>

              <div className="landing-score-grid">
                <div>
                  <small>Leads Generated</small>
                  <strong>12,450+</strong>
                </div>
                <div>
                  <small>Hours Saved/Mo</small>
                  <strong>320+</strong>
                </div>
                <div>
                  <small>YouTube Views</small>
                  <strong>5M+</strong>
                </div>
                <div>
                  <small>GHL Workflows</small>
                  <strong>Active</strong>
                </div>
              </div>

              <div className="landing-timeline">
                <div>
                  <span>Lead Captured</span>
                  <strong>Via Automated FB DM Funnel</strong>
                </div>
                <div>
                  <span>Nurture Sequence</span>
                  <strong>GoHighLevel Email & SMS triggered</strong>
                </div>
                <div>
                  <span>Meeting Booked</span>
                  <strong>Automatically synced to your calendar</strong>
                </div>
              </div>
            </div>

            <div className="landing-panel-card landing-panel-card-accent">
              <p>Best for</p>
              <strong>Coaches, Agencies, B2B Businesses, and Content Creators</strong>
            </div>
          </div>
        </section>

        <section id="services" className="landing-section">
          <SectionTitle
            eyebrow="Our Services"
            title="Comprehensive Automation Solutions."
            description="We don't just provide software; we build complete systems tailored to scale your operations."
          />

          <div className="landing-feature-grid">
            {featureCards.map((card) => (
              <article key={card.title} className="landing-feature-card">
                <p className="landing-feature-eyebrow">{card.eyebrow}</p>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="landing-section">
          <SectionTitle
            eyebrow="How We Work"
            title="A proven process for reliable scaling."
            description="We handle the complex tech integrations so you can focus on running your business."
          />

          <div className="landing-workflow-grid">
            {workflowSteps.map((item) => (
              <article key={item.title} className="landing-workflow-card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="why-us" className="landing-section landing-two-column">
          <SectionTitle
            eyebrow="Why Jento AI"
            title="We bridge the gap between AI tech and real business results."
            description="Most agencies use off-the-shelf templates. We build custom logic and automated architectures designed specifically for your unique offer."
          />

          <div className="landing-about-stack">
            <article className="landing-about-card">
              <span>Expert Team</span>
              <strong>Masters of GoHighLevel & AI</strong>
              <p>Our engineers deeply understand API integrations, webhook logic, and AI-driven workflows.</p>
            </article>
            <article className="landing-about-card">
              <span>True Partnership</span>
              <strong>We succeed when you scale</strong>
              <p>We treat your business like our own, ensuring every automation sequence is robust, secure, and profitable.</p>
            </article>
          </div>
        </section>

        <section id="contact" className="landing-final-cta">
          <div>
            <p className="landing-eyebrow">Take the next step</p>
            <h2>Ready to automate your growth?</h2>
            <p>
              Book a free discovery call today. We'll map out the exact automation systems your business needs.
            </p>
          </div>
          <div className="landing-cta-row landing-cta-row-tight">
            <a href="mailto:hello@jentoai.pro" className="landing-primary-button">
              Contact Us
            </a>
            <Link to="/login" className="landing-secondary-button">
              Client Portal
            </Link>
          </div>
        </section>

        <footer className="mt-20 py-8 border-t border-gray-200 text-center text-gray-500 text-sm">
          <p>© 2026 Jento AI. All rights reserved.</p>
          <div className="mt-4 flex justify-center space-x-4">
            <Link to="/privacy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
