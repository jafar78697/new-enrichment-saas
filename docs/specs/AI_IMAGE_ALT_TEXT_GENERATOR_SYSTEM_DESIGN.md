# AI Image Alt Text Generator System Design

Version: 1.0
Date: 2026-07-01
Owner: JentoAI
Route: `/tools/image-alt-text-generator`

## 1. Goal

Build a production-ready MVP for a free AI Image Alt Text Generator tool. Users upload an image, optionally provide a target SEO keyword, choose a generation mode and language, then receive four optimized alt text variants:

1. Short Alt Text
2. SEO Alt Text
3. Accessibility Alt Text
4. E-commerce Alt Text

The tool should feel fast, clean, mobile-friendly, and suitable for a JentoAI tools website. Backend secrets must never be exposed to frontend code.

## 2. Key Requirements

### 2.1 Frontend

- Next.js with TypeScript.
- Route: `/tools/image-alt-text-generator`.
- Firebase Hosting.
- Drag-and-drop image upload.
- Optional keyword input.
- Mode selector:
  - General
  - SEO
  - Accessibility
  - E-commerce
- Language selector:
  - English
  - Roman Urdu
  - Hindi
- Generate button.
- Loading state.
- Error state.
- Result cards with copy buttons:
  - Short Alt Text
  - SEO Alt Text
  - Accessibility Alt Text
  - E-commerce Alt Text
- FAQ section.
- Related tools section.
- CTA: `Need bulk alt text? Upgrade to Pro`

### 2.2 Backend

- Node.js/Express API.
- Cloud Run deployment.
- Endpoint: `POST /api/alt-text`.
- Accept multipart image upload.
- Validate image type: `jpg`, `jpeg`, `png`, `webp`.
- Reject files larger than 5MB.
- Track daily usage by user/IP in Firestore.
- Free limit: 5 generations per day.
- Use Gemini API for image understanding.
- Return strict JSON.
- Do not permanently store uploaded images.
- Save usage log to Firestore.

### 2.3 Cloud Services

- Google Cloud Run: backend API.
- Firebase Hosting: Next.js frontend.
- Firestore: usage tracking and logs.
- Google Secret Manager: Gemini API key and salts.
- Google Cloud Storage: optional temporary upload bucket.

### 2.4 Existing AWS VM Safety

The AWS VM may already host other systems. This tool should not delete, overwrite, or restart unrelated AWS services.

For this MVP, preferred backend hosting is Google Cloud Run. AWS should only be touched if the existing website/domain routing requires a reverse proxy or DNS integration.

Before touching AWS:

- Inspect running services: `pm2 list`, `docker ps`, `systemctl`, `nginx -T`.
- Create config backups.
- Do not delete old folders.
- Do not run destructive cleanup commands.
- Rotate any exposed AWS keys before using them.

## 3. High-Level Architecture

```text
User Browser
  |
  | HTTPS
  v
Firebase Hosting
  |
  | serves Next.js static/frontend assets
  |
  | /api/alt-text rewrite/proxy
  v
Cloud Run Express API
  |
  | validate image, rate limit, prompt Gemini
  |
  +--> Firestore
  |      - daily usage counters
  |      - usage logs
  |
  +--> Secret Manager
  |      - GEMINI_API_KEY
  |      - IP_HASH_SALT
  |
  +--> Gemini API
  |      - image understanding
  |
  +--> GCS temp bucket optional
         - temp image upload
         - immediate delete/lifecycle cleanup
```

## 4. Recommended MVP Approach

Use in-memory image processing for MVP.

Reason:

- Simpler.
- Faster.
- No temporary image cleanup risk.
- Smaller attack surface.

GCS should be added as an optional fallback only when Cloud Run memory limits or future file-processing requirements make it necessary.

## 5. Frontend System Design

### 5.1 Route

```text
/tools/image-alt-text-generator
```

### 5.2 Page Structure

```text
ImageAltTextGeneratorPage
  SEO page header
  ToolShell
    UploadDropzone
    KeywordInput
    ModeSelector
    LanguageSelector
    GenerateButton
    ErrorBanner
    LoadingState
    ResultGrid
      ResultCard x4
  SEOContentSections
  FAQSection
  RelatedToolsSection
  ProCTA
```

### 5.3 Main UI Content

H1:

```text
Free AI Image Alt Text Generator
```

Intro:

```text
Upload an image and generate natural, SEO-friendly, and accessibility-friendly alt text in seconds.
```

SEO page sections:

- What is an AI Image Alt Text Generator?
- Why image alt text matters for SEO
- Why alt text matters for accessibility
- How to write good alt text
- FAQs

### 5.4 Frontend State

```ts
type Mode = 'general' | 'seo' | 'accessibility' | 'ecommerce';
type Language = 'english' | 'roman_urdu' | 'hindi';

interface AltTextResult {
  short_alt_text: string;
  seo_alt_text: string;
  accessibility_alt_text: string;
  ecommerce_alt_text: string;
  notes?: string;
}

interface ToolState {
  file: File | null;
  previewUrl: string | null;
  keyword: string;
  mode: Mode;
  language: Language;
  isDragging: boolean;
  isLoading: boolean;
  error: string | null;
  result: AltTextResult | null;
}
```

### 5.5 Frontend Validation

Client validation improves UX, but server validation remains authoritative.

Client checks:

- Only one image.
- Accepted extensions:
  - `.jpg`
  - `.jpeg`
  - `.png`
  - `.webp`
- File size under 5MB.
- Keyword max length: 120 characters.
- Image preview generated with `URL.createObjectURL`.

### 5.6 API Request

Frontend sends `multipart/form-data`.

Fields:

- `image`: file, required.
- `keyword`: string, optional.
- `mode`: string, optional.
- `language`: string, optional.

Example:

```ts
const form = new FormData();
form.append('image', file);
form.append('keyword', keyword);
form.append('mode', mode);
form.append('language', language);

const res = await fetch('/api/alt-text', {
  method: 'POST',
  body: form,
});
```

### 5.7 Result Cards

Each card includes:

- Title.
- Generated text.
- Character count.
- Copy button.
- Copied state.

Card titles:

- Short Alt Text
- SEO Alt Text
- Accessibility Alt Text
- E-commerce Alt Text

### 5.8 Accessibility UX

- Upload zone must be keyboard accessible.
- Use real `<button>` elements.
- Add `aria-live="polite"` for loading/result updates.
- Error messages should be visible and screen-reader friendly.
- Copy confirmation should not depend on color alone.
- The uploaded preview image should have empty alt: `alt=""`, because it is decorative in the tool UI.

## 6. Backend System Design

### 6.1 Service

Service name:

```text
alt-text-api
```

Runtime:

```text
Node.js 20+
Express
TypeScript recommended
```

Deployment:

```text
Google Cloud Run
```

### 6.2 Endpoint

```http
POST /api/alt-text
Content-Type: multipart/form-data
```

Request:

```text
image: file, required
keyword: string, optional
mode: general | seo | accessibility | ecommerce, optional
language: english | roman_urdu | hindi, optional
```

Response 200:

```json
{
  "short_alt_text": "",
  "seo_alt_text": "",
  "accessibility_alt_text": "",
  "ecommerce_alt_text": "",
  "notes": ""
}
```

Error response:

```json
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "Images must be smaller than 5MB."
  }
}
```

### 6.3 Backend Request Flow

```text
1. Receive multipart request.
2. Read IP/user identifier.
3. Validate file exists.
4. Validate file size <= 5MB.
5. Validate MIME and magic bytes.
6. Validate keyword/mode/language.
7. Hash IP/user ID with server-side salt.
8. Check Firestore daily usage counter.
9. If daily limit exceeded, return 429.
10. Build Gemini prompt.
11. Send image + prompt to Gemini.
12. Parse and validate strict JSON response.
13. Increment usage counter.
14. Save usage log.
15. Return JSON to frontend.
16. Delete temp image if GCS was used.
```

### 6.4 Express Middleware

Recommended middleware:

- `helmet`
- `cors`
- `express-rate-limit`
- `multer`
- `zod`
- `file-type`
- structured logger such as `pino`

### 6.5 File Validation

Do not trust only browser MIME.

Checks:

- `file.size <= 5 * 1024 * 1024`
- `file.mimetype` in allowlist.
- Magic-byte detection using `file-type`:
  - `image/jpeg`
  - `image/png`
  - `image/webp`

Reject:

- SVG.
- GIF.
- TIFF.
- HEIC for MVP.
- Files without detected image type.

### 6.6 Usage Limit

Free limit:

```text
5 generations per day per IP hash
```

Identifier:

```text
sha256(ip + ":" + yyyy-mm-dd + ":" + IP_HASH_SALT)
```

Daily document ID:

```text
{yyyy-mm-dd}_{ipHash}
```

Use Firestore transaction to avoid race conditions.

### 6.7 Firestore Collections

#### Collection: `alt_text_usage_daily`

Document ID:

```text
{date}_{ipHash}
```

Example:

```json
{
  "date": "2026-07-01",
  "ipHash": "sha256-value",
  "count": 3,
  "firstUsedAt": "timestamp",
  "lastUsedAt": "timestamp"
}
```

#### Collection: `alt_text_usage_logs`

Auto ID.

Example:

```json
{
  "timestamp": "serverTimestamp",
  "date": "2026-07-01",
  "ipHash": "sha256-value",
  "mode": "seo",
  "language": "english",
  "keyword": "running shoes",
  "imageSize": 842111,
  "imageMime": "image/jpeg",
  "status": "success",
  "latencyMs": 2410,
  "geminiModel": "gemini-1.5-flash-or-current",
  "errorCode": null
}
```

Do not store:

- Raw IP address.
- Image bytes.
- Permanent image URL.
- Gemini raw response if it may contain sensitive content.

### 6.8 Optional GCS Temp Storage

Bucket:

```text
{project-id}-alt-text-temp
```

Path:

```text
temp-alt-text/{yyyy-mm-dd}/{uuid}.{ext}
```

Rules:

- Upload only if needed.
- Delete after Gemini call.
- Add lifecycle rule to auto-delete after 1 day.
- Never make objects public.

MVP can skip GCS and send image bytes directly to Gemini.

## 7. Gemini Prompt Design

### 7.1 System Instruction

The model should be instructed to generate only JSON and follow strict safety and quality rules.

Prompt rules:

- Describe only what is visible in the image.
- Do not keyword stuff.
- Use the keyword only if naturally relevant.
- Do not identify private people.
- Do not infer sensitive attributes such as religion, race, health, politics, disability, or age.
- Keep alt text natural and useful.
- Short alt text must be under 125 characters.
- Accessibility alt text should clearly describe the main visual content.
- E-commerce alt text should focus on product details when product-related.
- SEO alt text should include the keyword only when relevant.
- If the image is unclear, say so in notes, but still provide useful alt text.
- Output must be in selected language.

### 7.2 Prompt Template

```text
You are an expert SEO and accessibility copywriter.

Analyze the provided image and create alt text variants.

Inputs:
- Target keyword: {keyword_or_none}
- Mode: {mode}
- Language: {language}

Rules:
1. Describe only visible content.
2. Do not identify private people.
3. Do not infer sensitive attributes including religion, race, health, politics, disability, or age.
4. Use the keyword only if naturally relevant.
5. Do not keyword stuff.
6. Short alt text must be under 125 characters.
7. SEO alt text should be natural and search-friendly.
8. Accessibility alt text should be clear for screen reader users.
9. E-commerce alt text should focus on product details only if the image is product-related.
10. Return JSON only. No markdown. No explanation outside JSON.

Return this exact JSON shape:
{
  "short_alt_text": "",
  "seo_alt_text": "",
  "accessibility_alt_text": "",
  "ecommerce_alt_text": "",
  "notes": ""
}
```

### 7.3 Response Validation

Validate Gemini response using schema:

```ts
const GeminiAltTextResponse = z.object({
  short_alt_text: z.string().min(1).max(125),
  seo_alt_text: z.string().min(1).max(300),
  accessibility_alt_text: z.string().min(1).max(500),
  ecommerce_alt_text: z.string().min(1).max(350),
  notes: z.string().max(500).optional().default(''),
});
```

If Gemini returns invalid JSON:

1. Try to extract JSON object.
2. Validate again.
3. If still invalid, retry once with a stricter repair prompt.
4. If still invalid, return 502 with `AI_RESPONSE_INVALID`.

## 8. Security Design

### 8.1 Secrets

Secrets must never be committed or exposed to frontend.

Use Secret Manager for:

- `GEMINI_API_KEY`
- `IP_HASH_SALT`

Cloud Run environment variables:

- `GOOGLE_CLOUD_PROJECT`
- `STORAGE_BUCKET`
- `NODE_ENV`
- `ALLOWED_ORIGINS`

### 8.2 CORS

Allow only:

- production JentoAI domain
- Firebase Hosting domain
- local development origin

Example:

```text
https://jentoai.com
https://www.jentoai.com
https://*.web.app
https://*.firebaseapp.com
http://localhost:3000
```

### 8.3 API Abuse Controls

Layers:

1. File size limit.
2. IP daily quota in Firestore.
3. Express rate limit.
4. Cloud Run max instances.
5. Gemini API quota monitoring.

Suggested API rate limit:

```text
20 requests / 10 minutes / IP
```

Daily generation limit:

```text
5 successful generations / day / IP hash
```

### 8.4 Privacy

Privacy guarantees:

- Uploaded images are processed temporarily.
- Images are not permanently stored.
- IP is hashed with server-side salt.
- Logs do not store image content.
- Usage logs store only metadata.

Frontend copy should mention:

```text
Images are processed temporarily and are not stored permanently.
```

## 9. Deployment Design

### 9.1 Frontend: Firebase Hosting

Firebase config:

```json
{
  "hosting": {
    "public": "out",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "alt-text-api",
          "region": "us-central1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

If using Next.js static export:

```js
// next.config.js
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  }
};

module.exports = nextConfig;
```

### 9.2 Backend: Cloud Run

Dockerfile:

```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY dist ./dist

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/server.js"]
```

### 9.3 Cloud Run Deploy Command

```bash
gcloud run deploy alt-text-api \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=jentoai-prod,STORAGE_BUCKET=jentoai-alt-text-temp \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest,IP_HASH_SALT=IP_HASH_SALT:latest
```

### 9.4 Firebase Deploy Command

```bash
npm install
npm run build
firebase deploy --only hosting
```

### 9.5 Required IAM

Cloud Run service account needs:

- Secret Manager Secret Accessor
- Firestore User
- Storage Object Admin only if GCS temp uploads are enabled

Firebase deploy account needs:

- Firebase Hosting Admin
- Cloud Run Viewer/Developer if using rewrites to Cloud Run

## 10. Project Structure

Recommended structure if this is a standalone tools app:

```text
apps/
  alt-text-web/
    src/
      app/
        tools/
          image-alt-text-generator/
            page.tsx
      components/
        tools/
          ImageAltTextGenerator.tsx
          UploadDropzone.tsx
          ResultCard.tsx
      lib/
        api.ts
    next.config.js
    firebase.json
    package.json

  alt-text-api/
    src/
      server.ts
      routes/
        alt-text.ts
      services/
        gemini.service.ts
        usage.service.ts
        storage.service.ts
      utils/
        hash.ts
        validation.ts
      schemas/
        alt-text.schema.ts
    Dockerfile
    package.json
```

If adding inside an existing app, keep the same logical boundaries:

- frontend page/components near current web app routes
- backend route/service inside current API app
- no secrets in frontend

## 11. API Contract

### 11.1 Success

```http
POST /api/alt-text
200 OK
```

```json
{
  "short_alt_text": "Black running shoe on a white background",
  "seo_alt_text": "Black running shoe with cushioned sole, suitable for product image alt text",
  "accessibility_alt_text": "A black athletic running shoe shown from the side on a plain white background.",
  "ecommerce_alt_text": "Black lace-up running shoe with textured sole and low-cut athletic design.",
  "notes": "Keyword was used only where relevant."
}
```

### 11.2 Errors

```http
400 BAD_REQUEST
```

```json
{
  "error": {
    "code": "IMAGE_REQUIRED",
    "message": "Please upload an image."
  }
}
```

```http
413 PAYLOAD_TOO_LARGE
```

```json
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "Images must be smaller than 5MB."
  }
}
```

```http
415 UNSUPPORTED_MEDIA_TYPE
```

```json
{
  "error": {
    "code": "UNSUPPORTED_IMAGE_TYPE",
    "message": "Only JPG, PNG, and WebP images are supported."
  }
}
```

```http
429 TOO_MANY_REQUESTS
```

```json
{
  "error": {
    "code": "DAILY_LIMIT_REACHED",
    "message": "You have used your 5 free generations for today."
  }
}
```

```http
502 BAD_GATEWAY
```

```json
{
  "error": {
    "code": "AI_GENERATION_FAILED",
    "message": "The AI could not generate alt text right now. Please try again."
  }
}
```

## 12. Observability

### 12.1 Logs

Log fields:

- requestId
- ipHash prefix, not full hash
- file size
- MIME type
- mode
- language
- usage count
- Gemini latency
- status code
- error code

Never log:

- full IP
- image bytes
- Gemini API key
- uploaded image content

### 12.2 Metrics

Track:

- generations per day
- success rate
- error rate
- average Gemini latency
- 429 count
- unsupported file attempts
- average file size
- Cloud Run memory/CPU

### 12.3 Alerts

Alert on:

- 5xx error rate over threshold
- Gemini failures spike
- Cloud Run memory near limit
- Secret access errors
- Firestore permission errors

## 13. SEO Content Design

### 13.1 Page Metadata

Title:

```text
Free AI Image Alt Text Generator | SEO & Accessibility Alt Text
```

Description:

```text
Generate SEO-friendly and accessibility-friendly image alt text with AI. Upload an image, add an optional keyword, and get short, SEO, accessibility, and e-commerce alt text versions.
```

Canonical:

```text
https://jentoai.com/tools/image-alt-text-generator
```

### 13.2 FAQ Ideas

1. What is alt text?
2. Why does alt text matter for SEO?
3. How long should alt text be?
4. Should I include keywords in alt text?
5. Can AI write accessible alt text?
6. Do you store uploaded images?
7. What image formats are supported?
8. Is this tool free?

### 13.3 Related Tools

Potential links:

- AI Meta Description Generator
- SEO Title Generator
- Image Caption Generator
- Product Description Generator
- Blog Outline Generator

## 14. Pro Upgrade Path

MVP CTA:

```text
Need bulk alt text? Upgrade to Pro
```

Future Pro features:

- Bulk CSV/image upload.
- Shopify/WooCommerce integration.
- Team usage.
- Saved history.
- Export to CSV.
- Brand voice settings.
- API access.
- Higher daily limits.
- Login with Firebase Auth.

## 15. Future Auth Design

For MVP, usage is IP-based.

Later:

- Add Firebase Auth.
- Use `uid` as usage key when logged in.
- Keep IP limit as fallback for anonymous users.
- Add paid plans and Firestore entitlement records.

Entitlement example:

```json
{
  "userId": "firebase-uid",
  "plan": "pro",
  "dailyLimit": 500,
  "monthlyLimit": 10000,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

## 16. Implementation Phases

### Phase 1: Foundation

- Create frontend route.
- Create backend Express service.
- Add local env config.
- Add Firestore connection.
- Add Gemini service wrapper.
- Add shared response schema.

### Phase 2: MVP Tool UI

- Build upload dropzone.
- Add keyword input.
- Add mode/language selectors.
- Add result cards.
- Add copy buttons.
- Add loading and error states.
- Add SEO content and FAQ.

### Phase 3: API and AI

- Implement `POST /api/alt-text`.
- Validate file type and size.
- Implement IP hashing.
- Implement Firestore daily quota transaction.
- Implement Gemini prompt and response parsing.
- Save usage logs.

### Phase 4: Deployment

- Add Dockerfile.
- Add Cloud Run deploy config.
- Add Firebase Hosting config.
- Add Secret Manager setup.
- Deploy staging.
- Test route and API rewrite.

### Phase 5: Production Hardening

- Add rate limiting.
- Add structured logs.
- Add Cloud Run alerts.
- Add privacy copy.
- Add robots/canonical metadata.
- Add manual QA checklist.

## 17. QA Checklist

Functional:

- JPG upload works.
- PNG upload works.
- WebP upload works.
- Over-5MB file rejected.
- Invalid file rejected.
- Empty upload rejected.
- Keyword optional.
- All modes work.
- All languages work.
- Copy buttons work.
- Results reset when new image selected.

Quota:

- First 5 generations succeed.
- 6th generation returns 429.
- New day resets quota.
- Concurrent requests do not bypass quota.

Security:

- Gemini key not in frontend bundle.
- Raw IP not stored.
- Image not stored permanently.
- CORS blocks unknown origins.
- SVG upload rejected.

Deployment:

- Firebase route loads.
- Cloud Run health check works.
- `/api/alt-text` rewrite works.
- Firestore writes work.
- Secret Manager access works.

SEO:

- H1 exists.
- Metadata set.
- FAQ section present.
- Related tools section present.
- CTA present.
- Mobile layout clean.

## 18. Local Development Commands

Frontend:

```bash
npm install
npm run dev
```

Backend:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Firebase deploy:

```bash
firebase deploy --only hosting
```

Cloud Run deploy:

```bash
gcloud run deploy alt-text-api \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

## 19. Open Decisions

1. Should this be added inside the existing JentoAI frontend or as a separate Next.js tools app?
2. Should MVP use in-memory image processing only, or also use GCS temp uploads?
3. Which domain will serve the final page?
   - `jentoai.com/tools/image-alt-text-generator`
   - `app.jentoai.pro/tools/image-alt-text-generator`
   - another tools subdomain
4. Which Gemini model should be used for launch?
5. Should anonymous users get 5/day and logged-in users get higher quota later?

## 20. Recommended Launch Defaults

- Frontend: Next.js static page on Firebase Hosting.
- Backend: Express API on Cloud Run.
- Image processing: in-memory.
- File size: 5MB.
- Free limit: 5/day/IP hash.
- Firestore logs: metadata only.
- Gemini response: strict JSON with Zod validation.
- GCS: optional, disabled for MVP unless required.
- CTA: Pro upgrade placeholder.

