# 006 — RT photo lightbox: enter and exit

- **Status**: DONE
- **Commit**: web@19c3aac
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 2 files

## Problem
`web/src/rt/RtPanel.tsx:110` renders the lightbox portal and `:204` unmounts it on close: it cuts in and out. `RtPanel.less:293` has no motion.

## Target (modal: centred, exempt from trigger origin)
- Enter: backdrop opacity 0→1 and image `scale(0.96)` + opacity 0→1, 200ms `cubic-bezier(0.2, 0.7, 0.2, 1)`.
- Exit: same properties reversed, 150ms, same curve; the component stays mounted while it plays, then calls `onClose`.
- Reduced motion: opacity only.
- Next/previous photo stays instant.

## Steps
1. `Lightbox`: `const [closing, setClosing] = useState(false)`; `close = () => { if (closing) return; setClosing(true); setTimeout(onClose, 150); }`;
   use `close` for the backdrop click and Escape; add class `closing` on the root.
2. `RtPanel.less` `.lightbox`: `animation: lightbox-in 200ms @ease both;` `img { animation: lightbox-img-in 200ms @ease both; }`;
   `&.closing { animation: lightbox-out 150ms @ease both; img { animation: lightbox-img-out 150ms @ease both; } }`; keyframes as above;
   reduced motion: img uses the opacity-only keyframes.

## Verification
- Open a title's RT panel, click a photo: it scales up from 96% with the backdrop fading; Escape/click outside fades it out.
