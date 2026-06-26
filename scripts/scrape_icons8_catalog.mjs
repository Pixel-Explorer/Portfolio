import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const destPath = path.join(__dirname, '../data/icons8_stickle.json');

const categories = [
  'photo-and-video',
  'business',
  'ecommerce',
  'folders',
  'time-and-date',
  'social-media',
  'gaming',
  'logos',
  'messaging'
];

async function scrapeCategory(cat) {
  const url = `https://icons8.com/icons/set/${cat}--style-3d-stickle--technique-3d`;
  console.log(`Scraping category: ${cat} from ${url}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed to fetch ${cat}: ${res.status}`);
      return [];
    }
    const html = await res.text();
    const regex = /\/icon\/([A-Za-z0-9]+)\/([a-z0-9\-]+)/g;
    let match;
    const icons = [];
    while ((match = regex.exec(html)) !== null) {
      const id = match[1];
      const name = match[2];
      // Filter out utility tokens like favicon/svg/set
      if (id !== 'favicon' && id !== 'svg' && id !== 'set' && id !== 'l' && id !== 'app') {
        icons.push({ id, name, category: cat });
      }
    }
    return icons;
  } catch (err) {
    console.error(`Error scraping ${cat}:`, err.message);
    return [];
  }
}

async function run() {
  const allIcons = [];
  const seenIds = new Set();

  // Also include the main page items we already know
  const knownMainItems = [
    { id: '1qEOPjNe5EOO', name: 'cursor', category: 'general' },
    { id: '8uxcDrRXiu7F', name: 'box-with-papers-in-folders', category: 'general' },
    { id: 'IX6T33VmzOFZ', name: 'ai-dashboard', category: 'general' },
    { id: 'uYi0QpODTeQu', name: 'hand-up', category: 'general' },
    { id: '517SqvLCHk5s', name: 'old-computer-with-clover', category: 'general' },
    { id: 'yt7o2dIs5IcB', name: 'stack-of-papers', category: 'general' },
    { id: 'WC0vQTAiqiCy', name: 'happy-retro-robot', category: 'general' },
    { id: 'Ddqn4By1wSqN', name: 'apple', category: 'general' },
    { id: 'gvQEVycoJDOM', name: 'diagram-and-graphic-tools', category: 'general' },
    { id: 'GZBAnOKL3XjZ', name: 'retro-robot-jumping', category: 'general' },
    { id: 'taV1WOm43xYR', name: 'folder-with-papers-and-ai-stars', category: 'general' },
    { id: 'xgzolxyag2dH', name: 'megaphone-with-stickers', category: 'general' },
    { id: 'SxACkOfB1em7', name: 'memo-pad-and-pencil', category: 'general' },
    { id: 'P0xOYQhMll76', name: 'retro-computer-with-face', category: 'general' },
    { id: 'tGf4SoKxEg3F', name: 'ipod-with-stickers', category: 'general' },
    { id: 's7WwEfARVFgq', name: 'happy-robot-hello', category: 'general' },
    { id: 'dqrZQzp8XMmL', name: 'box-with-stickers', category: 'general' },
    { id: 'YnEoJQ1TJfoP', name: 'browser-chart-ai', category: 'general' },
    { id: 'uSZeiCs2HS9n', name: 'blue-gameboy-with-stickers', category: 'general' },
    { id: 'szA4KC9AQEFA', name: 'old-computer-with-stickers', category: 'general' },
    { id: '9h49JhJE6eQg', name: 'charts-in-metal-box', category: 'general' },
    { id: 'HmxnCdOkooNv', name: 'soda-can', category: 'general' },
    { id: '7WmqLlsozGBw', name: 'graphic-design-program-tools', category: 'general' },
    { id: 'xVtNEBhqZRf5', name: 'box-design-analytical-tools', category: 'general' },
    { id: 'gqcL8tR6on6Q', name: 'smartphone-with-charms', category: 'general' },
    { id: '3mRzBtKhYE0y', name: 'banana-with-stickers', category: 'general' },
    { id: 'nEEU4ZXou1qX', name: 'journal-with-stickers', category: 'general' },
    { id: 'moKUpsFxSr7Q', name: 'notebook-pens-sticker', category: 'general' },
    { id: 'Kcgo3v1BEqpN', name: 'tamagotchi', category: 'general' },
    { id: 'ZOp90goIfael', name: 'headphones-stickers-charm', category: 'general' },
    { id: 'Cx2VthSMozMi', name: 'cherry', category: 'general' },
    { id: 'sZgnoSRZgOsZ', name: 'trophy', category: 'general' },
    { id: '5ZwMh4j8y0vr', name: 'chatgpt-crown-cap', category: 'general' },
    { id: 'vbesnbH8cDHa', name: 'suitcase-with-stickers', category: 'general' },
    { id: 'HsYLoBQ51aE7', name: 'document', category: 'general' },
    { id: '2k10ALuc4Jyl', name: 'skateboard', category: 'general' },
    { id: 'oygLWT4wpiyn', name: 'notebook-ai-research', category: 'general' },
    { id: '7wKa6EW5Qu1k', name: 'suitcase-stickers-sunglasses', category: 'general' }
  ];

  for (const item of knownMainItems) {
    allIcons.push(item);
    seenIds.add(item.id);
  }

  for (const cat of categories) {
    const list = await scrapeCategory(cat);
    for (const item of list) {
      if (!seenIds.has(item.id)) {
        allIcons.push(item);
        seenIds.add(item.id);
      }
    }
    // Pause briefly to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Ensure data folder exists
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(destPath, JSON.stringify(allIcons, null, 2), 'utf8');
  console.log(`\nSaved ${allIcons.length} unique 3D Stickle icons to ${destPath}`);
}

run().catch(console.error);
