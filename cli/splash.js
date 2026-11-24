// Stremio+ launch animation (macOS). Stremio plays Contents/MacOS/splash.mp4 (2.5 s, 2184x1224, 30 fps) and then shows
// splash.jpg (its final frame) until the UI is ready. We don't ship Stremio's artwork: the patch renders ours from the
// user's own copies with Stremio's bundled ffmpeg: the particle animation shifted to purple, plus a dotted white "+"
// (the play triangle's dot pattern) that spins in beside the diamond once it has formed.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const P = require('./paths');

// Stremio drops the splash as soon as the UI is ready (~1.3 s on a warm launch), so the 2.5 s original would be cut off
// mid-warp: skip its first 0.6 s and play it 1.25x faster. The diamond then forms at ~0.7 s and the plus lands by ~1.2 s.
const FPS = 30;
const SKIP = 0.6;
const SPEED = 1.25;
const FRAMES = Math.ceil(((2.5 - SKIP) / SPEED) * FPS);
const BOX = 300;                  // plus canvas; the plus is drawn centred in it
const C = BOX / 2;
const CENTER = { x: 1400, y: 315 }; // outside the diamond's top-right edge, like a superscript
const T0 = 0.72;                  // as the diamond settles (retimed clock)
const DUR = 0.32;
const HUE = 'hue=h=32:s=1.08';    // blue-violet → purple

const L = 166;                    // arm span
const T = 54;                     // arm thickness
const R = 14;                     // corner radius
const PLUS = `M${C - T / 2},${C - L / 2 + R} q0,-${R} ${R},-${R} h${T - 2 * R} q${R},0 ${R},${R} V${C - T / 2} `
    + `H${C + L / 2 - R} q${R},0 ${R},${R} v${T - 2 * R} q0,${R} -${R},${R} H${C + T / 2} V${C + L / 2 - R} `
    + `q0,${R} -${R},${R} h-${T - 2 * R} q-${R},0 -${R},-${R} V${C + T / 2} H${C - L / 2 + R} q-${R},0 -${R},-${R} `
    + `v-${T - 2 * R} q0,-${R} ${R},-${R} H${C - T / 2} Z`;

const svg = (scale, opacity, rotate) => `<svg xmlns="http://www.w3.org/2000/svg" width="${BOX}" height="${BOX}">
<defs>
  <pattern id="dots" width="11" height="11" patternUnits="userSpaceOnUse" x="${C}" y="${C}">
    <circle cx="5.5" cy="5.5" r="4.4" fill="#fff"/>
  </pattern>
  <clipPath id="plus"><path d="${PLUS}"/></clipPath>
</defs>
<g opacity="${opacity}" transform="translate(${C} ${C}) rotate(${rotate}) scale(${scale}) translate(${-C} ${-C})">
  <path d="${PLUS}" fill="#2a0d6b" opacity="0.55"/>
  <rect width="${BOX}" height="${BOX}" fill="url(#dots)" clip-path="url(#plus)"/>
</g>
</svg>`;

// Back-out ease: a small overshoot as it lands.
const easeOutBack = (p) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);

const frameAt = (k) => {
    const p = Math.min(1, Math.max(0, (k / FPS - T0) / DUR));
    if (p === 0) return { scale: 0.001, opacity: 0, rotate: 0 };
    return { scale: 0.35 + 0.65 * easeOutBack(p), opacity: Math.min(1, p * 3), rotate: -90 * Math.pow(1 - p, 3) };
};

// Render splash.mp4 + splash.jpg into outDir from Stremio's original files. Needs sharp (installed with the server).
const render = async ({ ffmpeg, srcVideo, srcImage, outDir }) => {
    const sharp = require(path.join(P.ADDON, 'node_modules', 'sharp'));
    const work = path.join(outDir, 'frames');
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    for (let k = 0; k < FRAMES; k++) {
        const f = frameAt(k);
        await sharp(Buffer.from(svg(f.scale, f.opacity, f.rotate))).png()
            .toFile(path.join(work, `p${String(k).padStart(3, '0')}.png`));
    }
    const at = `x=${CENTER.x - C}:y=${CENTER.y - C}`;
    const video = path.join(outDir, 'splash.mp4');
    const image = path.join(outDir, 'splash.jpg');
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(SKIP), '-i', srcVideo, '-framerate', String(FPS), '-i', path.join(work, 'p%03d.png'),
        '-filter_complex', `[0:v]setpts=(PTS-STARTPTS)/${SPEED},fps=${FPS},${HUE}[bg];[bg][1:v]overlay=${at}:format=auto:eof_action=repeat,format=yuv420p[v]`,
        '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', '-r', String(FPS), video]);
    // The still comes from Stremio's clean still (the video's last frame has faint particle noise) + the settled plus.
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', srcImage, '-i', path.join(work, `p${String(FRAMES - 1).padStart(3, '0')}.png`),
        '-filter_complex', `[0:v]${HUE}[bg];[bg][1:v]overlay=${at}:format=auto`, '-frames:v', '1', '-q:v', '2', image]);
    fs.rmSync(work, { recursive: true, force: true });
    return { video, image };
};

module.exports = { render };
