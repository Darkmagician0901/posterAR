# Deployment Guide - XR Poster

Complete guide for deploying the XR Poster AR web application to various platforms.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Platform Deployment](#platform-deployment)
  - [The two halves](#the-two-halves)
  - [Amplify app](#amplify-app)
  - [Rewrites](#rewrites)
  - [Verifying a deploy](#verifying-a-deploy)
- [Environment Variables](#environment-variables)
- [Custom Domain Setup](#custom-domain-setup)
- [SSL/HTTPS Configuration](#sslhttps-configuration)
- [QR Code Generation](#qr-code-generation)
- [Monitoring & Analytics](#monitoring--analytics)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, ensure you have:

- ✅ Node.js 18+ installed
- ✅ Git repository initialized
- ✅ All dependencies installed (`npm install`)
- ✅ Successful local build (`npm run build`)
- ✅ Type checking passes (`npm run type-check`)

## Platform Deployment

**Production is AWS Amplify Hosting. There is no Vercel, Netlify, or Docker
deploy.** Earlier revisions of this document described all three; none of them
were ever wired up on this repo, and `vercel.json`, `deploy.yml`, and the
`deploy:vercel` / `deploy:netlify` npm scripts they referenced do not exist.

### The two halves

The app deploys as two independent pieces:

| Piece | How it deploys | Built by |
|---|---|---|
| Static site (`dist/`) | Amplify builds from the connected branch on push | `amplify.yml` |
| API (`dist-lambda.zip`) | Uploaded manually to the Lambda | `npm run build:lambda` |

`.github/workflows/ci.yml` **does not deploy anything** — it type-checks, lints,
tests, and builds, and that is all. Merging to `main` is what ships.

### Amplify app

- App id **`d114nr20m4npww`**, region **`ca-central-1`**.
- Amplify reads **`amplify.yml`** (build) and **`customHttp.yml`** (headers,
  including the CSP). It **ignores `public/_headers`** — that file is a leftover
  and changing it has no effect on production.
- Each branch also gets its own preview URL; `main` serves production.

### Rewrites

Three rules, in this order. Read the live values back rather than trusting this
list:

```bash
aws amplify get-app --app-id d114nr20m4npww --region ca-central-1   --query 'app.customRules'
```

1. `/api/<*>` → the API Lambda's function URL. This is why the frontend can call
   `/api/publish` with **no** `VITE_API_BASE_URL` set — the path is same-origin
   and Amplify proxies it.
2. The SPA catch-all → `/index.html`. Its regex excludes anything ending in a
   known asset extension (`png`, `json`, `js`, `css`, …), so those fall through.
3. `/image-targets/<*>` → S3 `markers/<*>`, serving marker luminance images
   same-origin. The 8th Wall engine resolves `imagePath` relative to the page,
   so this **must** stay same-origin.

**A rewrite beats a committed static file at the same path.** Anything under
`public/image-targets/` is inert in production — rule 3 wins.

### Deploying the API

> **This has already bitten once.** The function sat a week stale while the site
> shipped past it, so the live publish endpoint validated against an older schema
> and silently stripped fields Studio was authoring — returning 200 the whole
> time. See `docs/cleanup-backlog.md` §9.
>
> Redeploy whenever anything under `api/` changes **or anything `api/` imports**
> changes — today that includes `src/story/storyDoc.ts` and
> `src/exhibit/exhibitDoc.ts`. Merging is not shipping for this half.
>
> Snapshot before overwriting, so rollback is a version switch:
> ```bash
> aws lambda publish-version --function-name eml-arcade-api --region ca-central-1
> ```

The Lambda is not deployed by Amplify or by CI:

```bash
npm run build:lambda      # writes dist-lambda.zip
```

Upload that zip to the function with the handler set to `index.handler`. It
serves exactly three routes (`api/_lambda.ts`): `/api/story-assets`,
`/api/publish`, `/api/publish-exhibit`. Note that `/api/assets` and `/api/spaces`
— called by `posterApi.ts` and `spaceApi.ts` — are **not** among them. Those are
served only by the parked Express app in `server/`, and both callers gate
themselves on `VITE_API_BASE_URL` being set, so with it unset the features are
cleanly disabled rather than broken.

### Verifying a deploy

Check by **content type**, never by "a page appeared" — the SPA catch-all
returns `index.html` with HTTP 200 for a missing asset, so a broken build still
looks fine in a browser:

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}
'   https://main.d114nr20m4npww.amplifyapp.com/
# expect: 200 text/html

curl -s -o /dev/null -w '%{http_code} %{content_type}
'   https://main.d114nr20m4npww.amplifyapp.com/assets/<hashed-bundle>.js
# expect: 200 text/javascript   (text/html means the asset is MISSING)
```

Build status:

```bash
aws amplify list-jobs --app-id d114nr20m4npww --branch-name main   --region ca-central-1 --max-results 5   --query 'jobSummaries[].{id:jobId,status:status,commit:commitId}' --output table
```


## Environment Variables

Amplify holds these at the **app** level (no branch-level overrides are set).
Read the live values back rather than trusting this list:

```bash
aws amplify get-app --app-id d114nr20m4npww --region ca-central-1   --query 'app.environmentVariables'
```

### Currently set

| Variable | Value | Used by |
|---|---|---|
| `VITE_ASSET_BASE_URL` | the S3 bucket origin | `assetResolver`, Studio thumbnails |
| `VITE_STORY_BASE_URL` | the S3 bucket origin | `storyApi`, `exhibitApi` |

### Deliberately NOT set

| Variable | Effect of leaving it unset |
|---|---|
| `VITE_API_BASE_URL` | `isPersistenceEnabled()` and `isSpacePersistenceEnabled()` both return false, so poster and space persistence are **off**. Publishing still works, because it calls `/api/…` same-origin through the Amplify rewrite. Setting this to the Lambda would switch those features on — and they would 404, because the Lambda serves only `story-assets`, `publish`, and `publish-exhibit`. |

Anything read through `import.meta.env` is **baked in at build time** and is
public. Never put a secret in a `VITE_`-prefixed variable — the publish key is
held server-side by the Lambda, not shipped to the browser.

## Custom Domain Setup

### Vercel

1. Go to Project Settings → Domains
2. Add your domain (e.g., `xr-poster.com`)
3. Configure DNS:
   ```
   Type: CNAME
   Name: @
   Value: cname.vercel-dns.com
   ```
4. Vercel automatically provisions SSL certificate

### Netlify

1. Go to Site Settings → Domain Management
2. Add custom domain
3. Configure DNS:
   ```
   Type: CNAME
   Name: @
   Value: <site-name>.netlify.app
   ```
4. Netlify automatically provisions SSL certificate

### Cloudflare Pages

1. Go to Pages → Custom Domains
2. Add your domain
3. DNS is automatically configured if domain is on Cloudflare
4. SSL certificate is automatically provisioned

---

## SSL/HTTPS Configuration

### Automatic SSL (Recommended)

All platforms (Vercel, Netlify, Cloudflare) provide automatic SSL certificates via Let's Encrypt.

### Custom SSL Certificate

**Vercel:**
- Not supported (uses automatic Let's Encrypt)

**Netlify:**
- Go to Site Settings → Domain Management → HTTPS
- Upload custom certificate

**Cloudflare:**
- Go to SSL/TLS → Custom Certificates
- Upload certificate and private key

### HTTPS Enforcement

All deployment configurations automatically redirect HTTP to HTTPS.

---

## QR Code Generation

Generate QR codes for easy mobile access:

### Basic Usage

```bash
npm run generate-qr -- https://xr-poster.vercel.app
```

### Advanced Options

```bash
# Custom size and format
npm run generate-qr -- https://xr-poster.vercel.app --size 500 --format png

# Custom output directory
npm run generate-qr -- https://xr-poster.vercel.app --output ./dist/qr-codes

# Custom colors
npm run generate-qr -- https://xr-poster.vercel.app --dark "#667eea" --light "#ffffff"
```

### Output Files

The script generates:
- `qr-code.png` - PNG image
- `qr-code.svg` - SVG image (scalable)
- `qr-code-preview.html` - HTML preview page
- Terminal output for quick scanning

### Integration with Build

Add to `package.json` scripts:
```json
{
  "scripts": {
    "postbuild": "npm run generate-qr -- https://xr-poster.vercel.app"
  }
}
```

---

## Monitoring & Analytics

### Google Analytics 4

1. **Create GA4 property:**
   - Go to [analytics.google.com](https://analytics.google.com)
   - Create new property
   - Get Measurement ID (G-XXXXXXXXXX)

2. **Add to environment variables:**
   ```bash
   VITE_GA_TRACKING_ID=G-XXXXXXXXXX
   ```

3. **Track custom events (example — not wired up by default):**
   ```typescript
   gtag('event', 'ar_session_start', {
     session_type: '8thwall-ar',
     device: navigator.userAgent
   });
   ```

### Sentry Error Tracking

1. **Create Sentry project:**
   - Go to [sentry.io](https://sentry.io)
   - Create new project
   - Get DSN

2. **Add to environment variables:**
   ```bash
   VITE_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
   ```

### Vercel Analytics

Automatically enabled for Vercel deployments:
- Core Web Vitals tracking
- Real User Monitoring (RUM)
- Performance insights

Access at: Project → Analytics

### Lighthouse CI

Netlify deployments include automatic Lighthouse audits:
- Performance score
- Accessibility score
- Best practices score
- SEO score

Reports available in deployment logs.

---

## Troubleshooting

### Build Failures

**Issue:** TypeScript errors during build
```bash
# Solution: Run type check locally
npm run type-check
# Fix all errors before deploying
```

**Issue:** Out of memory during build
```bash
# Solution: Increase Node memory
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

### Deployment Issues

**Issue:** 404 on page refresh
- **Cause:** SPA routing not configured
- **Solution:** Ensure `vercel.json`, `netlify.toml`, or `_redirects` is present

**Issue:** AR won't start / engine stuck loading
- **Cause:** Not using HTTPS; CSP blocking the engine CDN; or unsupported iOS (needs Safari 16.4+ / WebAssembly SIMD)
- **Solution:** Access via `https://`; ensure CSP `script-src` allows `https://cdn.jsdelivr.net`; check the in-app Diagnostic Panel note for the specific cause

**Issue:** Camera permission denied
- **Cause:** Browser security restrictions
- **Solution:** Ensure HTTPS is enabled and camera permissions are granted

### Performance Issues

**Issue:** Slow initial load
```bash
# Solution: Analyze bundle size
npm run analyze
# Optimize large dependencies
```

**Issue:** Low FPS on mobile
- **Cause:** Too many posters or high-resolution textures
- **Solution:** Reduce `VITE_MAX_POSTERS` or optimize poster images

### Docker Issues

**Issue:** Container fails to start
```bash
# Solution: Check logs
docker logs <container-id>
```

**Issue:** Permission denied
```bash
# Solution: Run with proper permissions
docker run --user $(id -u):$(id -g) -p 8080:80 xr-poster
```

---

## Post-Deployment Checklist

- [ ] Application loads successfully
- [ ] HTTPS is enabled and working
- [ ] 8th Wall engine loads + AR session starts on a mobile device
- [ ] Camera permission prompt appears
- [ ] Posters can be placed in AR (tap to place)
- [ ] Scale slider + delete work on the selected poster
- [ ] Screenshot feature works
- [ ] Custom poster upload works
- [ ] QR code generated and accessible
- [ ] Analytics tracking (if enabled)
- [ ] Error tracking (if enabled)
- [ ] Performance metrics acceptable
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate valid

---

## Rollback Procedure

### Vercel
```bash
# List deployments
vercel ls

# Rollback to previous deployment
vercel rollback <deployment-url>
```

### Netlify
```bash
# List deployments
netlify deploy:list

# Restore previous deployment
netlify deploy:restore <deploy-id>
```

### Cloudflare Pages
- Go to Pages → Deployments
- Click "Rollback" on previous deployment

### Docker
```bash
# Pull previous image version
docker pull <registry>/xr-poster:<previous-tag>

# Restart with previous version
docker-compose down
docker-compose up -d
```

---

## Support

For deployment issues:
- Check [GitHub Issues](https://github.com/yourusername/xr-poster/issues)
- Review platform documentation:
  - [Vercel Docs](https://vercel.com/docs)
  - [Netlify Docs](https://docs.netlify.com)
  - [Cloudflare Pages Docs](https://developers.cloudflare.com/pages)
  - [Docker Docs](https://docs.docker.com)

---

**Last Updated:** 2026-06-08  
**Version:** 1.0.0