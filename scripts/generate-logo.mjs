import sharp from "sharp";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
  <!-- Background -->
  <rect width="480" height="480" fill="#000000"/>

  <!-- Window frame (outer) -->
  <g transform="translate(240, 155)">
    <!-- Left side panel (door/window frame) -->
    <rect x="-95" y="-95" width="18" height="130" rx="3" fill="white"/>
    <!-- Main window frame -->
    <rect x="-72" y="-95" width="110" height="130" rx="4" fill="none" stroke="white" stroke-width="10"/>
    <!-- Horizontal divider -->
    <line x1="-72" y1="-30" x2="38" y2="-30" stroke="white" stroke-width="7"/>
    <!-- Vertical divider -->
    <line x1="-17" y1="-95" x2="-17" y2="35" stroke="white" stroke-width="7"/>
    <!-- Diamond sparkle top-right (inside) -->
    <g transform="translate(18, -55)">
      <path d="M0,-9 L3,0 L0,9 L-3,0 Z" fill="white"/>
      <path d="M-9,0 L0,-3 L9,0 L0,3 Z" fill="white"/>
    </g>
    <!-- Diamond sparkle bottom-left (inside) -->
    <g transform="translate(-45, 5)">
      <path d="M0,-9 L3,0 L0,9 L-3,0 Z" fill="white"/>
      <path d="M-9,0 L0,-3 L9,0 L0,3 Z" fill="white"/>
    </g>
    <!-- Sparkle top-right outside (large) -->
    <g transform="translate(60, -72)">
      <path d="M0,-16 L4,0 L0,16 L-4,0 Z" fill="white"/>
      <path d="M-16,0 L0,-4 L16,0 L0,4 Z" fill="white"/>
    </g>
    <!-- Sparkle mid-right outside (small) -->
    <g transform="translate(48, -45)">
      <path d="M0,-8 L2,0 L0,8 L-2,0 Z" fill="white"/>
      <path d="M-8,0 L0,-2 L8,0 L0,2 Z" fill="white"/>
    </g>
  </g>

  <!-- VISION text -->
  <text
    x="240"
    y="305"
    font-family="Arial Black, Arial, sans-serif"
    font-size="90"
    font-weight="900"
    fill="white"
    text-anchor="middle"
    letter-spacing="8"
  >VISION</text>

  <!-- -LAVAGE- text -->
  <text
    x="240"
    y="370"
    font-family="Arial, sans-serif"
    font-size="44"
    font-weight="400"
    fill="white"
    text-anchor="middle"
    letter-spacing="10"
  >-LAVAGE-</text>
</svg>`;

const svgBuffer = Buffer.from(svg);
const outputPath = path.join(__dirname, "../public/vision-lavage-logo.png");

await sharp(svgBuffer)
  .resize(480, 480)
  .png()
  .toFile(outputPath);

console.log(`✓ Logo généré: ${outputPath}`);
