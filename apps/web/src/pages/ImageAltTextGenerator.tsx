import { useEffect, useMemo, useState } from 'react';
import { Copy, ImagePlus, LoaderCircle, RefreshCw, Sparkles, Upload } from 'lucide-react';
import { generateAltText, type AltTextLanguage, type AltTextMode, type AltTextResult } from '../services/altTextApi';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const modeOptions: Array<{ value: AltTextMode; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'seo', label: 'SEO' },
  { value: 'accessibility', label: 'Accessibility' },
  { value: 'ecommerce', label: 'E-commerce' },
];

const languageOptions: Array<{ value: AltTextLanguage; label: string }> = [
  { value: 'english', label: 'English' },
  { value: 'roman_urdu', label: 'Roman Urdu' },
  { value: 'hindi', label: 'Hindi' },
];

const resultCards: Array<{ key: keyof AltTextResult; title: string }> = [
  { key: 'short_alt_text', title: 'Short Alt Text' },
  { key: 'seo_alt_text', title: 'SEO Alt Text' },
  { key: 'accessibility_alt_text', title: 'Accessibility Alt Text' },
  { key: 'ecommerce_alt_text', title: 'E-commerce Alt Text' },
];

const faqItems = [
  {
    question: 'What is alt text?',
    answer: 'Alt text is a short description of an image that helps screen readers explain visuals and gives search engines better context.',
  },
  {
    question: 'Does this help with SEO?',
    answer: 'Yes. Better alt text can improve image relevance and page clarity when the description naturally matches what is visible.',
  },
  {
    question: 'Do you store uploaded images?',
    answer: 'Images are processed temporarily for generation and should not be stored permanently as part of this tool flow.',
  },
  {
    question: 'Which image formats work?',
    answer: 'This MVP supports JPG, PNG, and WebP files up to 5 MB.',
  },
];

const relatedTools = [
  'AI Meta Description Generator',
  'SEO Title Generator',
  'Image Caption Generator',
  'Product Description Generator',
];

function validateFile(file: File | null): string | null {
  if (!file) return 'Please upload an image.';
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Only JPG, PNG, and WebP images are supported.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'Images must be smaller than 5MB.';
  }
  return null;
}

export default function ImageAltTextGeneratorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [mode, setMode] = useState<AltTextMode>('general');
  const [language, setLanguage] = useState<AltTextLanguage>('english');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AltTextResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const fileMeta = useMemo(() => {
    if (!file) return null;
    return `${(file.size / 1024 / 1024).toFixed(2)} MB`;
  }, [file]);

  const handleFile = (nextFile: File | null) => {
    const validation = validateFile(nextFile);
    setFile(nextFile);
    setResult(null);
    setCopiedKey(null);
    setError(validation);
  };

  const onSubmit = async () => {
    const validation = validateFile(file);
    if (validation) {
      setError(validation);
      return;
    }
    if (keyword.length > 120) {
      setError('Keyword must be 120 characters or fewer.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setResult(null);
      const data = await generateAltText({
        file: file as File,
        keyword: keyword.trim(),
        mode,
        language,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate alt text.');
    } finally {
      setIsLoading(false);
    }
  };

  const onCopy = async (key: keyof AltTextResult) => {
    if (!result?.[key] || typeof result[key] !== 'string') return;
    await navigator.clipboard.writeText(result[key] as string);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="tool-page-shell">
      <header className="tool-page-topbar">
        <a href="/" className="tool-page-brand">
          <img src="/favicon.png" alt="Jento AI" />
          <span>Jento AI Tools</span>
        </a>
        <a href="/#contact" className="tool-page-toplink">Upgrade to Pro</a>
      </header>

      <main className="tool-page-main">
        <section className="tool-hero">
          <div className="tool-hero-copy">
            <div className="tool-badge">
              <Sparkles size={16} />
              <span>Free SEO + accessibility tool</span>
            </div>
            <h1>Free AI Image Alt Text Generator</h1>
            <p>
              Upload an image and generate natural, SEO-friendly, and accessibility-friendly alt text in seconds.
            </p>
          </div>
        </section>

        <section className="tool-workspace" aria-live="polite">
          <div className="tool-panel">
            <div className="tool-panel-header">
              <div>
                <h2>Generate alt text</h2>
                <p>Images are processed temporarily and are not stored permanently.</p>
              </div>
            </div>

            <label
              className={`tool-upload-zone${isDragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                handleFile(event.dataTransfer.files?.[0] || null);
              }}
            >
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={(event) => handleFile(event.target.files?.[0] || null)}
              />
              <div className="tool-upload-icon">
                {file ? <ImagePlus size={20} /> : <Upload size={20} />}
              </div>
              <strong>{file ? file.name : 'Drop an image here or click to upload'}</strong>
              <span>{fileMeta || 'JPG, PNG, or WebP up to 5 MB'}</span>
            </label>

            <div className="tool-control-grid">
              <label className="tool-field">
                <span>Target keyword</span>
                <input
                  type="text"
                  value={keyword}
                  maxLength={120}
                  placeholder="running shoes, product photo, bakery display"
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </label>

              <label className="tool-field">
                <span>Mode</span>
                <select value={mode} onChange={(event) => setMode(event.target.value as AltTextMode)}>
                  {modeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="tool-field">
                <span>Language</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value as AltTextLanguage)}>
                  {languageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? <div className="tool-alert tool-alert-error">{error}</div> : null}

            <div className="tool-action-row">
              <button type="button" className="tool-primary-button" onClick={onSubmit} disabled={isLoading}>
                {isLoading ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}
                <span>{isLoading ? 'Generating...' : 'Generate alt text'}</span>
              </button>

              <button
                type="button"
                className="tool-secondary-button"
                onClick={() => {
                  setFile(null);
                  setKeyword('');
                  setMode('general');
                  setLanguage('english');
                  setError(null);
                  setResult(null);
                }}
              >
                <RefreshCw size={18} />
                <span>Reset</span>
              </button>
            </div>
          </div>

          <div className="tool-preview-panel">
            <div className="tool-preview-header">
              <h2>Preview</h2>
              <p>Best results come from clear, well-framed images.</p>
            </div>
            <div className="tool-preview-frame">
              {previewUrl ? (
                <img src={previewUrl} alt="" className="tool-preview-image" />
              ) : (
                <div className="tool-preview-empty">
                  <ImagePlus size={28} />
                  <span>Your uploaded image will appear here.</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {result ? (
          <section className="tool-results-section">
            <div className="tool-results-header">
              <h2>Generated variants</h2>
              <p>Use the version that best matches your page intent.</p>
            </div>
            <div className="tool-results-grid">
              {resultCards.map((card) => {
                const value = (result[card.key] || '') as string;
                return (
                  <article key={card.key} className="tool-result-card">
                    <div className="tool-result-head">
                      <h3>{card.title}</h3>
                      <button type="button" onClick={() => onCopy(card.key)}>
                        <Copy size={16} />
                        <span>{copiedKey === card.key ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <p>{value}</p>
                    <small>{value.length} characters</small>
                  </article>
                );
              })}
            </div>
            {result.notes ? <div className="tool-alert tool-alert-note">{result.notes}</div> : null}
          </section>
        ) : null}

        <section className="tool-content-grid">
          <div className="tool-content-column">
            <article className="tool-copy-block">
              <h2>What is an AI Image Alt Text Generator?</h2>
              <p>
                It analyzes the visible content in an image and drafts multiple alt text variations for SEO, accessibility,
                and product-focused pages.
              </p>
            </article>
            <article className="tool-copy-block">
              <h2>Why image alt text matters for SEO</h2>
              <p>
                Useful alt text gives search engines clearer context while helping your images match the intent of the page.
              </p>
            </article>
            <article className="tool-copy-block">
              <h2>Why alt text matters for accessibility</h2>
              <p>
                Screen reader users rely on alt text to understand visuals, so concise and accurate descriptions make pages
                much easier to use.
              </p>
            </article>
          </div>

          <aside className="tool-side-column">
            <section className="tool-faq-section">
              <h2>FAQs</h2>
              <div className="tool-faq-list">
                {faqItems.map((item) => (
                  <article key={item.question} className="tool-faq-item">
                    <h3>{item.question}</h3>
                    <p>{item.answer}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="tool-related-section">
              <h2>Related tools</h2>
              <div className="tool-related-list">
                {relatedTools.map((tool) => (
                  <div key={tool} className="tool-related-item">{tool}</div>
                ))}
              </div>
            </section>

            <section className="tool-cta-band">
              <p>Need bulk alt text?</p>
              <strong>Upgrade to Pro</strong>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}
