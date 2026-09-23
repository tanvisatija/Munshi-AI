// Custom solid-fill glyphs (24x24). Bold, flat shapes in the spirit of Paytm's service grid,
// not a thin outline set. Glyphs are white on a coloured tile, or currentColor when used inline.
const P = {
  home: 'M12 2.5 1.5 11.2l1.3 1.6L4 11.8V21h6v-6h4v6h6v-9.2l1.2 1 1.3-1.6z',
  bell: 'M12 22.5a2.6 2.6 0 0 0 2.5-2h-5a2.6 2.6 0 0 0 2.5 2Zm7.5-6V11a7.5 7.5 0 0 0-5.5-7.2V3a2 2 0 0 0-4 0v.8A7.5 7.5 0 0 0 4.5 11v5.5L2.5 18.5V19.5h19v-1z',
  heart: 'M12 21.5S2.5 15.9 1.2 10C.4 6.4 2.9 3 6.5 3c2.3 0 4 1.2 5.5 3 1.5-1.8 3.2-3 5.5-3 3.6 0 6.1 3.4 5.3 7-1.3 5.9-10.8 11.5-10.8 11.5Z',
  growth: 'M3 13.5h4.5V21H3zM9.75 9h4.5v12h-4.5zM16.5 3.5H21V21h-4.5z',
  shield: 'M12 1.5 3 5v6.3c0 5.4 3.8 10.1 9 11.2 5.2-1.1 9-5.8 9-11.2V5zM10.6 6.5h2.8v7.2h-2.8zm0 9h2.8v2.8h-2.8z',
  chat: 'M4 3h16a2.5 2.5 0 0 1 2.5 2.5v10A2.5 2.5 0 0 1 20 18h-9.5L5 22.5V18H4a2.5 2.5 0 0 1-2.5-2.5v-10A2.5 2.5 0 0 1 4 3Zm2.5 7a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0Zm4 0a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0Zm4 0a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0Z',
  clipboard: 'M9 1.5h6A1.5 1.5 0 0 1 16.5 3v.5H19A2.5 2.5 0 0 1 21.5 6v14.5A2.5 2.5 0 0 1 19 23H5a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 5 3.5h2.5V3A1.5 1.5 0 0 1 9 1.5ZM7 10v2.4h10V10Zm0 4.6V17h7v-2.4Z',
  user: 'M12 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Zm-10 10c0-4.7 4.5-8 10-8s10 3.3 10 8z',
  users: 'M8.5 11a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm8.5 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM0.5 21.5c0-4 3.6-7 8-7s8 3 8 7zm17.5 0c0-2.6-.9-4.8-2.4-6.4 4.3-.5 8 1.9 8 6.4z',
  rupee: 'M6 2.5h12v2.7h-3.4c.5.6.9 1.3 1.1 2.1H18V10h-2.3c-.5 2.7-2.6 4.5-5.7 4.8l6.2 7.7h-3.9l-6-7.6v-2.6h2.4c1.6 0 2.7-.7 3.1-2.3H6V7.3h7.6c-.5-1.3-1.6-2.1-3.3-2.1H6Z',
  clock: 'M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21Zm1.3 4.5h-2.6v7.3l5.6 3.4 1.3-2.2-4.3-2.6Z',
  doc: 'M5.5 1.5h9l6 6v13A2.5 2.5 0 0 1 18 23H5.5A2.5 2.5 0 0 1 3 20.5V4A2.5 2.5 0 0 1 5.5 1.5Zm8 1.8v5.2h5.2ZM7 12v2.2h10V12Zm0 4.3v2.2h7v-2.2Z',
  tag: 'M2 2h9.3l10.9 10.9-9.3 9.3L2 11.3Zm5.5 3.2a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6Z',
  send: 'M1.5 21.5 23 12 1.5 2.5v7.4l15 2.1-15 2.1Z',
  check: 'M9.2 15.6 4.9 11.3 2.7 13.5l6.5 6.5L21.3 7.9l-2.2-2.2Z',
  download: 'M10.6 2h2.8v9.2l3.6-3.6 2 2L12 16.6 5 9.6l2-2 3.6 3.6ZM3 18.5h18v3H3z',
  lock: 'M6.5 10V7a5.5 5.5 0 0 1 11 0v3H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Zm3 0h5V7a2.5 2.5 0 0 0-5 0Z',
  chevronRight: 'M8.6 4.1 16.5 12l-7.9 7.9-2.1-2.1L12.3 12 6.5 6.2Z',
  chevronLeft: 'M15.4 4.1 7.5 12l7.9 7.9 2.1-2.1L11.7 12l5.8-5.8Z',
  chevronDown: 'M4.1 8.6 12 16.5l7.9-7.9-2.1-2.1L12 12.3 6.2 6.5Z',
  close: 'M6.2 4 12 9.8 17.8 4 20 6.2 14.2 12l5.8 5.8-2.2 2.2L12 14.2 6.2 20 4 17.8 9.8 12 4 6.2Z',
  calendar: 'M6.5 1.5h2.6v2h5.8v-2h2.6v2H19A2.5 2.5 0 0 1 21.5 6v14.5A2.5 2.5 0 0 1 19 23H5a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 5 3.5h1.5Zm-1.5 8v11h14v-11Zm2 2.5h3v3H7Z',
  store: 'M2.5 3h19l1.3 5.8A3.3 3.3 0 0 1 17 10.9a3.4 3.4 0 0 1-5 .1 3.4 3.4 0 0 1-5-.1 3.3 3.3 0 0 1-5.8-2.1Zm1.3 10a5.6 5.6 0 0 0 3.3.6V21H11v-4.5h2V21h3.9v-7.4a5.6 5.6 0 0 0 3.3-.6v10H3.8Z',
  trophy: 'M6 2h12v1.5h4V7a4.5 4.5 0 0 1-4.3 4.5 6 6 0 0 1-4.2 3.8V18H17v4H7v-4h3.5v-2.7a6 6 0 0 1-4.2-3.8A4.5 4.5 0 0 1 2 7V3.5h4Zm0 4H4.5v1a2 2 0 0 0 1.6 2Zm12 0v3a2 2 0 0 0 1.6-2V6Z',
  bolt: 'M14 1 3.5 13.5H11L9.5 23 20.5 10H13Z',
  search: 'M10 1.5a8.5 8.5 0 0 1 6.9 13.4l5.6 5.6-2.1 2.1-5.6-5.6A8.5 8.5 0 1 1 10 1.5Zm0 3a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z',
  eye: 'M12 4.5C5.5 4.5 1.5 12 1.5 12s4 7.5 10.5 7.5S22.5 12 22.5 12 18.5 4.5 12 4.5Zm0 12a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-2.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z',
  refresh: 'M12 3.5a8.5 8.5 0 0 1 7.2 4H16.5v2.8H23V3.8h-2.8v1.9A11.3 11.3 0 1 0 23.3 12h-2.8A8.5 8.5 0 1 1 12 3.5Z',
  trash: 'M8.5 1.5h7l1 1.5H21v2.8H3V3h4.5ZM4.5 7.5h15l-1.2 14a1.6 1.6 0 0 1-1.6 1.5H7.3a1.6 1.6 0 0 1-1.6-1.5Z',
  up: 'M12 4.5 21 16H3Z',
  down: 'M12 19.5 3 8h18Z',
  sliders: 'M3 5h8.3a3 3 0 0 1 5.4 0H21v2.6h-4.3a3 3 0 0 1-5.4 0H3Zm0 11.4h4.3a3 3 0 0 1 5.4 0H21V19h-8.3a3 3 0 0 1-5.4 0H3Z',
  target: 'M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21Zm0 3.3a7.2 7.2 0 1 1 0 14.4 7.2 7.2 0 0 1 0-14.4Zm0 3.2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  bulb: 'M12 1.5a7.5 7.5 0 0 1 4.5 13.5V17h-9v-2A7.5 7.5 0 0 1 12 1.5ZM8 18.5h8V21a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 21Z',
};

const EVENODD = new Set(['shield', 'chat', 'clipboard', 'doc', 'tag', 'lock', 'calendar', 'search', 'eye', 'clock', 'trophy', 'target']);

export function Icon({ name, className = 'h-5 w-5', title }) {
  const d = P[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={d} fillRule={EVENODD.has(name) ? 'evenodd' : undefined} clipRule={EVENODD.has(name) ? 'evenodd' : undefined} />
    </svg>
  );
}

// Each tile has its own solid colour, like the Paytm service grid.
export const TILE = {
  cyan: 'bg-cerulean',
  navy: 'bg-navy',
  green: 'bg-success',
  orange: 'bg-warning',
  red: 'bg-danger',
  deep: 'bg-cerulean-700',
};

export function IconTile({ name, color = 'cyan', size = 'md', className = '' }) {
  const box = size === 'lg' ? 'h-14 w-14 rounded-2xl' : size === 'sm' ? 'h-9 w-9 rounded-xl' : 'h-11 w-11 rounded-2xl';
  const glyph = size === 'lg' ? 'h-7 w-7' : size === 'sm' ? 'h-[18px] w-[18px]' : 'h-6 w-6';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center text-white ${box} ${TILE[color] || TILE.cyan} ${className}`}>
      <Icon name={name} className={glyph} />
    </span>
  );
}
