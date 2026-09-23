import { useId } from 'react';

// Brand marks, loaded from src/assets if present. import.meta.glob tolerates missing files,
// so the app builds and runs with a built-in fallback until the real logo files are added.
const urls = import.meta.glob('../assets/munshi_ai_*.{svg,png}', { eager: true, query: '?url', import: 'default' });
const raws = import.meta.glob('../assets/munshi_ai_logo.svg', { eager: true, query: '?raw', import: 'default' });

const pick = (name) => Object.entries(urls).find(([p]) => p.endsWith(name))?.[1];

export const LOGO_SVG_URL = pick('munshi_ai_logo.svg');
export const LOGO_PNG_URL = pick('munshi_ai_logo.png');
export const WORDMARK_PNG_URL = pick('munshi_ai_wordmark.png');

// Inline SVG markup (crisp at any size). Scripts and event handlers are stripped defensively.
export const LOGO_SVG_MARKUP = (Object.values(raws)[0] || '')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/\son\w+="[^"]*"/gi, '');

/** Built-in mark used only until the real logo files are dropped into src/assets. */
function FallbackMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#00BAF2" />
      <path d="M17 45V19h7.2l7.8 12.2L39.8 19H47v26h-6.6V30.4l-8.4 12.4-8.4-12.4V45z" fill="#fff" />
    </svg>
  );
}

// The mark is used several times per page; give each inline copy its own ids so
// internal references (clip paths etc.) never collide.
function uniqueIds(markup, suffix) {
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  return ids.reduce(
    (out, id) => out.replaceAll(`id="${id}"`, `id="${id}-${suffix}"`).replaceAll(`url(#${id})`, `url(#${id}-${suffix})`).replaceAll(`href="#${id}"`, `href="#${id}-${suffix}"`),
    markup,
  );
}

/**
 * The circular Munshi AI icon. Size it with className (e.g. "h-24 w-24").
 * onDark adds a thin cyan edge: the artwork's circle is the same navy as the header and
 * splash, so without it the circle's outline disappears on those surfaces.
 */
export function LogoMark({ className = 'h-9 w-9', title = 'Munshi AI', onDark = false }) {
  const uid = useId().replace(/:/g, '');
  const edge = onDark ? 'rounded-full ring-2 ring-cerulean/50' : '';
  if (LOGO_SVG_MARKUP) {
    return (
      <span
        role="img"
        aria-label={title}
        className={`inline-block shrink-0 [&>svg]:h-full [&>svg]:w-full ${edge} ${className}`}
        dangerouslySetInnerHTML={{ __html: uniqueIds(LOGO_SVG_MARKUP, uid) }}
      />
    );
  }
  const src = LOGO_SVG_URL || LOGO_PNG_URL;
  if (src) return <img src={src} alt={title} className={`shrink-0 object-contain ${edge} ${className}`} draggable="false" />;
  return (
    <span role="img" aria-label={title} className={`inline-block shrink-0 ${className}`}>
      <FallbackMark />
    </span>
  );
}

/** Favicon: point the tab icon at the real logo once it exists (index.html keeps a fallback). */
export function applyFavicon() {
  const href = LOGO_SVG_URL || LOGO_PNG_URL;
  if (!href || typeof document === 'undefined') return;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = LOGO_SVG_URL ? 'image/svg+xml' : 'image/png';
  link.href = href;
}
