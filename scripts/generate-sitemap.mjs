import fs from 'fs';
import path from 'path';

const LEDGER_PATH = path.resolve('data/ledger.json');
const SITEMAP_PATH = path.resolve('sitemap.xml');

try {
  const ledgerData = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf-8'));
  const entries = ledgerData.entries || [];
  
  const today = new Date().toISOString().split('T')[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  
  // Homepage
  xml += `  <url>\n`;
  xml += `    <loc>https://anirudh.website/</loc>\n`;
  xml += `    <lastmod>${today}</lastmod>\n`;
  xml += `    <changefreq>monthly</changefreq>\n`;
  xml += `    <priority>1.0</priority>\n`;
  xml += `  </url>\n`;
  
  // Entries
  for (const entry of entries) {
    if (!entry.id) continue;
    xml += `  <url>\n`;
    xml += `    <loc>https://anirudh.website/?entry=${entry.id}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>monthly</changefreq>\n`;
    xml += `    <priority>0.8</priority>\n`;
    xml += `  </url>\n`;
  }
  
  xml += `</urlset>\n`;
  
  fs.writeFileSync(SITEMAP_PATH, xml, 'utf-8');
  console.log(`Successfully generated sitemap.xml with ${entries.length} entry deep links.`);
} catch (error) {
  console.error("Error generating sitemap:", error);
}
