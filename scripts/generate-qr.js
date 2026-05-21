#!/usr/bin/env node

/**
 * QR Code Generator for XR Poster Deployment
 * 
 * Generates QR codes for easy mobile access to the deployed application.
 * Supports PNG and SVG formats with customizable options.
 * 
 * Usage:
 *   node scripts/generate-qr.js <url> [options]
 *   npm run generate-qr -- <url> [options]
 * 
 * Options:
 *   --output, -o    Output directory (default: ./public/qr-codes)
 *   --format, -f    Output format: png, svg, or both (default: both)
 *   --size, -s      QR code size in pixels (default: 300)
 *   --margin, -m    Margin size (default: 2)
 *   --dark          Dark color (default: #000000)
 *   --light         Light color (default: #FFFFFF)
 *   --name, -n      Output filename (default: qr-code)
 * 
 * Examples:
 *   node scripts/generate-qr.js https://xr-poster.vercel.app
 *   node scripts/generate-qr.js https://xr-poster.vercel.app --format png --size 500
 *   npm run generate-qr -- https://xr-poster.vercel.app --output ./dist/qr-codes
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
QR Code Generator for XR Poster

Usage: node scripts/generate-qr.js <url> [options]

Options:
  --output, -o    Output directory (default: ./public/qr-codes)
  --format, -f    Output format: png, svg, or both (default: both)
  --size, -s      QR code size in pixels (default: 300)
  --margin, -m    Margin size (default: 2)
  --dark          Dark color (default: #000000)
  --light         Light color (default: #FFFFFF)
  --name, -n      Output filename (default: qr-code)
  --help, -h      Show this help message

Examples:
  node scripts/generate-qr.js https://xr-poster.vercel.app
  node scripts/generate-qr.js https://xr-poster.vercel.app --format png --size 500
    `);
    process.exit(0);
  }
  
  const config = {
    url: args[0],
    output: './public/qr-codes',
    format: 'both',
    size: 300,
    margin: 2,
    dark: '#000000',
    light: '#FFFFFF',
    name: 'qr-code'
  };
  
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    
    switch (flag) {
      case '--output':
      case '-o':
        config.output = value;
        break;
      case '--format':
      case '-f':
        config.format = value;
        break;
      case '--size':
      case '-s':
        config.size = parseInt(value, 10);
        break;
      case '--margin':
      case '-m':
        config.margin = parseInt(value, 10);
        break;
      case '--dark':
        config.dark = value;
        break;
      case '--light':
        config.light = value;
        break;
      case '--name':
      case '-n':
        config.name = value;
        break;
    }
  }
  
  return config;
}

// Simple QR code generation using ASCII art (fallback if qrcode package not installed)
function generateSimpleQR(url, config) {
  console.log('\n⚠️  QR code package not installed. Installing qrcode...\n');
  
  try {
    const { execSync } = require('child_process');
    execSync('npm install qrcode', { stdio: 'inherit' });
    console.log('\n✅ QR code package installed successfully!\n');
    
    // Retry with the installed package
    return generateQRCode(url, config);
  } catch (error) {
    console.error('❌ Failed to install qrcode package.');
    console.error('Please run: npm install qrcode');
    console.error('\nAlternatively, use an online QR code generator:');
    console.error(`https://api.qrserver.com/v1/create-qr-code/?size=${config.size}x${config.size}&data=${encodeURIComponent(url)}`);
    process.exit(1);
  }
}

// Generate QR code using qrcode package
async function generateQRCode(url, config) {
  let QRCode;
  
  try {
    QRCode = require('qrcode');
  } catch (error) {
    return generateSimpleQR(url, config);
  }
  
  // Create output directory if it doesn't exist
  const outputDir = path.resolve(config.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const options = {
    width: config.size,
    margin: config.margin,
    color: {
      dark: config.dark,
      light: config.light
    }
  };
  
  const results = [];
  
  try {
    // Generate PNG
    if (config.format === 'png' || config.format === 'both') {
      const pngPath = path.join(outputDir, `${config.name}.png`);
      await QRCode.toFile(pngPath, url, options);
      results.push({ format: 'PNG', path: pngPath });
      console.log(`✅ PNG QR code generated: ${pngPath}`);
    }
    
    // Generate SVG
    if (config.format === 'svg' || config.format === 'both') {
      const svgPath = path.join(outputDir, `${config.name}.svg`);
      const svgString = await QRCode.toString(url, { ...options, type: 'svg' });
      fs.writeFileSync(svgPath, svgString);
      results.push({ format: 'SVG', path: svgPath });
      console.log(`✅ SVG QR code generated: ${svgPath}`);
    }
    
    // Generate terminal output
    const terminalQR = await QRCode.toString(url, { type: 'terminal', small: true });
    console.log('\n📱 Scan this QR code with your mobile device:\n');
    console.log(terminalQR);
    console.log(`🔗 URL: ${url}\n`);
    
    // Generate HTML preview file
    const htmlPath = path.join(outputDir, `${config.name}-preview.html`);
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QR Code - XR Poster</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      padding: 3rem;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    h1 {
      margin: 0 0 1rem 0;
      font-size: 2.5rem;
    }
    .qr-code {
      background: white;
      padding: 2rem;
      border-radius: 15px;
      margin: 2rem 0;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }
    .qr-code img {
      display: block;
      max-width: 100%;
      height: auto;
    }
    .url {
      font-size: 1.2rem;
      word-break: break-all;
      margin: 1rem 0;
      padding: 1rem;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 10px;
    }
    .instructions {
      font-size: 1rem;
      opacity: 0.9;
      margin-top: 1rem;
    }
    a {
      color: #fff;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎯 XR Poster</h1>
    <p class="instructions">Scan this QR code with your mobile device to access the AR experience</p>
    <div class="qr-code">
      <img src="${config.name}.png" alt="QR Code for ${url}">
    </div>
    <div class="url">
      <strong>URL:</strong><br>
      <a href="${url}" target="_blank">${url}</a>
    </div>
    <p class="instructions">
      📱 Requires iOS Safari 15+ or Android Chrome 79+<br>
      📷 Camera permission required for AR
    </p>
  </div>
</body>
</html>
    `.trim();
    
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`✅ HTML preview generated: ${htmlPath}`);
    
    return results;
  } catch (error) {
    console.error('❌ Error generating QR code:', error.message);
    process.exit(1);
  }
}

// Main execution
(async () => {
  console.log('\n🎯 XR Poster QR Code Generator\n');
  
  const config = parseArgs();
  
  if (!config.url) {
    console.error('❌ Error: URL is required');
    console.error('Usage: node scripts/generate-qr.js <url> [options]');
    console.error('Run with --help for more information');
    process.exit(1);
  }
  
  // Validate URL
  try {
    new URL(config.url);
  } catch (error) {
    console.error(`❌ Error: Invalid URL: ${config.url}`);
    process.exit(1);
  }
  
  console.log(`📍 URL: ${config.url}`);
  console.log(`📁 Output: ${config.output}`);
  console.log(`📐 Size: ${config.size}x${config.size}px`);
  console.log(`🎨 Format: ${config.format}\n`);
  
  await generateQRCode(config.url, config);
  
  console.log('\n✨ QR code generation complete!\n');
})();

// Made with Bob
