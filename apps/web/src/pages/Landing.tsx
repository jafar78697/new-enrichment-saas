import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const topNav = [
  { href: '#problem', label: 'Problem' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#features', label: 'Features' },
  { href: '#about', label: 'About' },
];

const featureCards = [
  {
    eyebrow: 'Fast intake',
    title: 'Paste links, upload CSVs, or start from your target list',
    description:
      'Enrichment Sys cleans incoming data, removes duplicates, and turns messy source lists into a job your team can run confidently.',
  },
  {
    eyebrow: 'Smart routing',
    title: 'Use the right enrichment lane for each website',
    description:
      'Static sites do not need the same expensive flow as JavaScript-heavy ones. The product balances speed, cost, and data quality by design.',
  },
  {
    eyebrow: 'Actionable output',
    title: 'Get structured company data your team can actually use',
    description:
      'See primary email, phone, LinkedIn, company details, industry signals, and a clear summary inside a readable results workspace.',
  },
];

const workflowSteps = [
  {
    title: '1. Add your input',
    description: 'Paste domains, upload a CSV, or bring in a source list from the workflow your team already uses.',
  },
  {
    title: '2. Let the engine route the job',
    description: 'The system decides when fast HTTP is enough and when a richer browser-based pass is worth the extra cost.',
  },
  {
    title: '3. Review and export',
    description: 'Inspect the results, apply filters, and send usable contact and company data to sales, ops, or research teams.',
  },
];

const statCards = [
  { value: '3 modes', label: 'Flexible enrichment for different site types' },
  { value: '1 workspace', label: 'Jobs, usage, and outputs in one place' },
  { value: 'Clear signals', label: 'Results with confidence and context' },
];

const faqs = [
  {
    question: 'What is this product built for?',
    answer:
      'It is designed for teams that need company research, website signals, and verified contact data without juggling too many tools.',
  },
  {
    question: 'Is it only for technical users?',
    answer:
      'No. The workflow is intentionally simple enough for founders, sales ops, analysts, and research teams to use without extra setup.',
  },
  {
    question: 'What do I get after signing up?',
    answer:
      'You get the dashboard, job creation flow, usage tracking, and a results explorer where you can inspect and export enriched data.',
  },
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
            <span className="landing-brand-mark">E</span>
            <span className="landing-brand-copy">
              <strong>Enrichment Sys</strong>
              <small>Turn research into a cleaner workflow</small>
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
              Log in
            </Link>
            <Link to={token ? '/dashboard' : '/signup'} className="landing-primary-button">
              {token ? 'Open dashboard' : 'Get started'}
            </Link>
          </div>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Built for modern enrichment workflows</p>
            <h1 className="landing-hero-title">
              Company research and verified contact data, without the manual chase.
            </h1>
            <p className="landing-hero-text">
              Enrichment Sys gives teams a clear place to run enrichment jobs, review signals, and export usable company data.
              Instead of dropping visitors straight into a signup form, the product now opens with a proper homepage that explains
              what it does, who it is for, and why it is worth using.
            </p>

            <div className="landing-cta-row">
              <Link to="/signup" className="landing-primary-button">
                Create free account
              </Link>
              <Link to="/login" className="landing-secondary-button">
                I already have access
              </Link>
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
                <span className="landing-panel-label">Live workflow snapshot</span>
                <span className="landing-panel-pill">Smart Hybrid</span>
              </div>

              <div className="landing-score-grid">
                <div>
                  <small>Domains queued</small>
                  <strong>1,280</strong>
                </div>
                <div>
                  <small>Signals found</small>
                  <strong>864</strong>
                </div>
                <div>
                  <small>Email coverage</small>
                  <strong>71%</strong>
                </div>
                <div>
                  <small>Browser credits</small>
                  <strong>Optimized</strong>
                </div>
              </div>

              <div className="landing-timeline">
                <div>
                  <span>Input cleaned</span>
                  <strong>CSV uploads and pasted lists merged into one job</strong>
                </div>
                <div>
                  <span>Engine selected the lane</span>
                  <strong>Static sites stayed on HTTP, complex ones moved to JS</strong>
                </div>
                <div>
                  <span>Results ready</span>
                  <strong>Workspace prepared for filtering, review, and export</strong>
                </div>
              </div>
            </div>

            <div className="landing-panel-card landing-panel-card-accent">
              <p>Best fit</p>
              <strong>Sales ops, market research, founder-led outreach, and data teams</strong>
            </div>
          </div>
        </section>

        <section id="problem" className="landing-section landing-two-column">
          <SectionTitle
            eyebrow="Problem"
            title="Most tools ask for a signup before they explain their value."
            description="A good SaaS homepage should build trust before it asks for action. This landing page now introduces the product clearly, explains the workflow, and gives visitors a better first impression before they move into auth."
          />

          <div className="landing-problem-card">
            <div>
              <span>Before</span>
              <strong>The product link opened directly on the signup screen</strong>
              <p>The value proposition was unclear, the brand story was missing, and the first impression felt abrupt.</p>
            </div>
            <div>
              <span>Now</span>
              <strong>The homepage explains the product first, then routes visitors into login or signup</strong>
              <p>Users understand where Enrichment Sys fits in their workflow before they are asked to create an account.</p>
            </div>
          </div>
        </section>

        <section id="workflow" className="landing-section">
          <SectionTitle
            eyebrow="Workflow"
            title="A simple path from raw inputs to structured enrichment results."
            description="The homepage is not just decorative. It mirrors the actual product journey so visitors can understand how the app works before they ever touch the dashboard."
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

        <section id="features" className="landing-section">
          <SectionTitle
            eyebrow="Features"
            title="The core highlights are now visible on the first screen instead of hidden behind auth."
            description="This makes the product feel more serious, more useful, and much easier to understand at a glance."
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

        <section id="about" className="landing-section landing-two-column">
          <SectionTitle
            eyebrow="About"
            title="Enrichment Sys is positioned for teams that want a focused enrichment product, not a cluttered stack."
            description="This section gives the homepage a proper company-style story so the product feels intentional, credible, and easier to trust."
          />

          <div className="landing-about-stack">
            <article className="landing-about-card">
              <span>Point of view</span>
              <strong>Fewer tabs, more clarity</strong>
              <p>The product is designed to bring company research, contact discovery, and website signals into one calmer interface.</p>
            </article>
            <article className="landing-about-card">
              <span>Who it serves</span>
              <strong>Founders, SDR teams, analysts, and ops leaders</strong>
              <p>Anyone who runs company research in batches gets a faster, more repeatable, and more team-friendly flow.</p>
            </article>
          </div>
        </section>

        <section className="landing-section">
          <SectionTitle
            eyebrow="FAQ"
            title="The questions visitors usually have before signup are answered up front."
            description="This lowers hesitation and makes the page feel like a complete product homepage instead of a single CTA wall."
          />

          <div className="landing-faq-list">
            {faqs.map((item) => (
              <article key={item.question} className="landing-faq-card">
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-final-cta">
          <div>
            <p className="landing-eyebrow">Start here</p>
            <h2>Now the experience starts with the product story, then moves into signup.</h2>
            <p>
              Create a new workspace if you are just getting started, or log in to open your dashboard if your team already has access.
            </p>
          </div>
          <div className="landing-cta-row landing-cta-row-tight">
            <Link to="/signup" className="landing-primary-button">
              Open signup
            </Link>
            <Link to="/login" className="landing-secondary-button">
              Open login
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
