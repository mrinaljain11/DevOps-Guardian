/**
 * DevOps-guardians Vite Watermarking Plugin
 * 
 * This plugin adds watermarks to production builds when used with Vite.
 * It can be added to your vite.config.ts file to automatically inject watermarks
 * into JavaScript files during the build process.
 * 
 * @license MIT
 * @version 1.0.0
 * @author DevOps-guardians Team
 */

// Implements a Vite plugin for code watermarking
export default function watermarkPlugin(options = {}) {
  const {
    licenseHolder = process.env.LICENSE_HOLDER || 'Unregistered',
    version = process.env.npm_package_version || '1.0.0',
    // Files to exclude from watermarking (e.g., third-party libraries)
    exclude = ['node_modules', '.json', '.css', '.html'],
    // Files to include in watermarking (default: all JavaScript files)
    include = ['.js', '.jsx', '.ts', '.tsx'],
    // Additional custom watermark text
    customText = '',
    // Whether to add the watermark as a comment or encode it
    encodeWatermark = false,
  } = options;

  // Create a build ID that's unique to this build
  const buildId = Date.now();
  
  return {
    name: 'devops-guardians-watermark',
    
    // Apply the transformation during build
    transform(code, id) {
      // Skip excluded files
      if (exclude.some(pattern => id.includes(pattern))) {
        return null;
      }
      
      // Only process included file types
      if (!include.some(ext => id.endsWith(ext))) {
        return null;
      }
      
      // Generate the watermark
      let watermark = `/* DevOps-guardians v${version} - Licensed to: ${licenseHolder} - Build: ${buildId}`;
      
      // Add custom text if provided
      if (customText) {
        watermark += ` - ${customText}`;
      }
      
      watermark += ' */';
      
      // Optionally encode the watermark for additional stealth
      if (encodeWatermark) {
        const encoded = Buffer.from(watermark).toString('base64');
        watermark = `/* ${encoded} */`;
      }
      
      // Add the watermark at the top of the file
      return `${watermark}\n${code}`;
    },
    
    // Add build information to the generated index.html
    transformIndexHtml(html) {
      // Don't expose license information in the HTML (more visible)
      // Just add a subtle build identifier
      const buildMeta = `<meta name="build-id" content="${buildId}">`;
      return html.replace('</head>', `  ${buildMeta}\n</head>`);
    },
    
    // Log watermarking info at the end of the build
    closeBundle() {
      if (process.env.NODE_ENV === 'production') {
        console.log(`\n📝 DevOps-guardians Watermarking: Production build ${buildId} has been watermarked.\n`);
      }
    }
  };
}

// Example usage in vite.config.ts:
/*
import { defineConfig } from 'vite';
import watermarkPlugin from './vite-watermark-plugin';

export default defineConfig({
  plugins: [
    // ...other plugins
    watermarkPlugin({
      licenseHolder: 'ABC Corporation',
      customText: 'Proprietary Software',
      encodeWatermark: true,
    }),
  ],
});
*/