# Deployment Guide - XR Poster

Complete guide for deploying the XR Poster AR web application to various platforms.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Platform Deployment](#platform-deployment)
  - [Vercel (Recommended)](#vercel-recommended)
  - [Netlify](#netlify)
  - [Cloudflare Pages](#cloudflare-pages)
  - [Docker](#docker)
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

### Vercel (Recommended)

Vercel provides the easiest deployment with automatic HTTPS and excellent performance.

#### Option 1: Deploy via CLI

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy to production:**
   ```bash
   npm run deploy:vercel
   # or
   vercel --prod
   ```

4. **Deploy preview:**
   ```bash
   npm run deploy:vercel:preview
   # or
   vercel
   ```

#### Option 2: Deploy via GitHub Integration

1. **Push code to GitHub:**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project"
   - Select your GitHub repository
   - Vercel will auto-detect Vite configuration

3. **Configure project:**
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm ci`

4. **Add environment variables** (optional):
   - Go to Project Settings → Environment Variables
   - Add variables from `.env.production.example`

5. **Deploy:**
   - Click "Deploy"
   - Vercel will build and deploy automatically
   - Every push to `main` triggers a new deployment

#### Vercel Configuration

The `vercel.json` file is already configured with:
- ✅ Security headers (CSP, HSTS, etc.)
- ✅ HTTPS redirect
- ✅ SPA routing
- ✅ CORS headers for WebXR
- ✅ Cache optimization

#### GitHub Actions Integration

The project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically:
- Runs type checking
- Builds the application
- Deploys to Vercel on push to `main`
- Creates preview deployments for pull requests

**Required GitHub Secrets:**
```
VERCEL_TOKEN          # Get from vercel.com/account/tokens
VERCEL_ORG_ID         # Found in .vercel/project.json after first deploy
VERCEL_PROJECT_ID     # Found in .vercel/project.json after first deploy
```

---

### Netlify

Netlify offers similar features to Vercel with excellent build optimization.

#### Option 1: Deploy via CLI

1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify:**
   ```bash
   netlify login
   ```

3. **Initialize site:**
   ```bash
   netlify init
   ```

4. **Deploy to production:**
   ```bash
   npm run deploy:netlify
   # or
   netlify deploy --prod
   ```

5. **Deploy preview:**
   ```bash
   npm run deploy:netlify:preview
   # or
   netlify deploy
   ```

#### Option 2: Deploy via GitHub Integration

1. **Push code to GitHub**

2. **Connect to Netlify:**
   - Go to [netlify.com](https://netlify.com)
   - Click "New site from Git"
   - Select your GitHub repository

3. **Configure build settings:**
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node version: `18`

4. **Add environment variables** (optional):
   - Go to Site Settings → Environment Variables
   - Add variables from `.env.production.example`

5. **Deploy:**
   - Click "Deploy site"
   - Netlify will build and deploy automatically

#### Netlify Configuration

The `netlify.toml` file is already configured with:
- ✅ Build settings
- ✅ Security headers
- ✅ HTTPS redirect
- ✅ SPA routing
- ✅ Cache optimization
- ✅ Lighthouse plugin for performance monitoring

**Required GitHub Secrets (for Actions):**
```
NETLIFY_AUTH_TOKEN    # Get from netlify.com/user/applications
NETLIFY_SITE_ID       # Found in Site Settings → General
```

---

### Cloudflare Pages

Cloudflare Pages provides global CDN with excellent performance and DDoS protection.

#### Deploy via Dashboard

1. **Push code to GitHub**

2. **Connect to Cloudflare Pages:**
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com)
   - Navigate to Pages
   - Click "Create a project"
   - Connect your GitHub repository

3. **Configure build settings:**
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: `18`

4. **Deploy:**
   - Click "Save and Deploy"
   - Cloudflare will build and deploy automatically

#### Cloudflare Configuration

The following files are configured:
- `wrangler.toml` - Build configuration
- `public/_headers` - Security and WebXR headers
- `public/_redirects` - SPA routing and HTTPS redirect

#### Deploy via Wrangler CLI

1. **Install Wrangler:**
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare:**
   ```bash
   wrangler login
   ```

3. **Deploy:**
   ```bash
   wrangler pages publish dist
   ```

---

### Docker

Deploy using Docker for maximum control and portability.

#### Build and Run Locally

1. **Build Docker image:**
   ```bash
   npm run docker:build
   # or
   docker build -t xr-poster .
   ```

2. **Run container:**
   ```bash
   npm run docker:run
   # or
   docker run -p 8080:80 xr-poster
   ```

3. **Access application:**
   - Open `http://localhost:8080`

#### Using Docker Compose

1. **Start services:**
   ```bash
   npm run docker:compose
   # or
   docker-compose up -d
   ```

2. **Stop services:**
   ```bash
   npm run docker:compose:down
   # or
   docker-compose down
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f
   ```

#### Deploy to Cloud Platforms

**AWS ECS:**
```bash
# Build and tag
docker build -t xr-poster .
docker tag xr-poster:latest <aws-account-id>.dkr.ecr.<region>.amazonaws.com/xr-poster:latest

# Push to ECR
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <aws-account-id>.dkr.ecr.<region>.amazonaws.com
docker push <aws-account-id>.dkr.ecr.<region>.amazonaws.com/xr-poster:latest
```

**Google Cloud Run:**
```bash
# Build and push
gcloud builds submit --tag gcr.io/<project-id>/xr-poster

# Deploy
gcloud run deploy xr-poster --image gcr.io/<project-id>/xr-poster --platform managed --region us-central1 --allow-unauthenticated
```

**Azure Container Instances:**
```bash
# Build and push
az acr build --registry <registry-name> --image xr-poster:latest .

# Deploy
az container create --resource-group <resource-group> --name xr-poster --image <registry-name>.azurecr.io/xr-poster:latest --dns-name-label xr-poster --ports 80
```

---

## Environment Variables

### Required Variables

None - the application works without environment variables.

### Optional Variables

Copy `.env.production.example` to `.env.production` and configure:

```bash
# Analytics
VITE_GA_TRACKING_ID=G-XXXXXXXXXX

# Error Tracking
VITE_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx

# Feature Flags
VITE_ENABLE_DEBUG_MODE=false
VITE_MAX_POSTERS=10
```

### Setting Environment Variables

**Vercel:**
```bash
vercel env add VITE_GA_TRACKING_ID production
```

**Netlify:**
```bash
netlify env:set VITE_GA_TRACKING_ID "G-XXXXXXXXXX"
```

**Cloudflare Pages:**
- Dashboard → Pages → Settings → Environment Variables

**Docker:**
```bash
docker run -p 8080:80 -e VITE_GA_TRACKING_ID=G-XXXXXXXXXX xr-poster
```

---

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

3. **Track custom events:**
   ```typescript
   // Already implemented in the app
   gtag('event', 'ar_session_start', {
     session_type: 'immersive-ar',
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

**Issue:** WebXR not working
- **Cause:** Not using HTTPS
- **Solution:** All platforms provide automatic HTTPS - ensure you're accessing via `https://`

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
- [ ] WebXR session starts on mobile device
- [ ] Camera permission prompt appears
- [ ] Posters can be placed in AR
- [ ] Gestures work (drag, pinch, rotate)
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

**Last Updated:** 2026-05-21  
**Version:** 1.0.0