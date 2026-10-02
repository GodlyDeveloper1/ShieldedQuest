// Small line icons (24px grid, currentColor), drawn for this app.
const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconLock = () => (
  <svg {...base}><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
);
export const IconEye = () => (
  <svg {...base}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IconKey = () => (
  <svg {...base}><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2" /></svg>
);
export const IconShield = () => (
  <svg {...base}><path d="M12 3 5 6v5.5c0 4.6 3 8.2 7 9.5 4-1.3 7-4.9 7-9.5V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const IconDevice = () => (
  <svg {...base}><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></svg>
);
export const IconServer = () => (
  <svg {...base}><rect x="3.5" y="4" width="17" height="7" rx="1.5" /><rect x="3.5" y="13" width="17" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></svg>
);
export const IconGhost = () => (
  <svg {...base}><path d="M5 20V10a7 7 0 0 1 14 0v10l-2.5-2-2.3 2-2.2-2-2.2 2-2.3-2L5 20Z" /><path d="M9.5 10.5h.01M14.5 10.5h.01" /></svg>
);
export const IconMap = () => (
  <svg {...base}><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" /><path d="M9 4v14M15 6v14" /></svg>
);
export const IconUsers = () => (
  <svg {...base}><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14.8c1.6.8 2.6 2.6 3 5.2" /></svg>
);
export const IconFlag = () => (
  <svg {...base}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
);
export const IconSpark = () => (
  <svg {...base}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>
);
export const IconGraduation = () => (
  <svg {...base}><path d="m2.5 9 9.5-4.5L21.5 9 12 13.5 2.5 9Z" /><path d="M6.5 11v4.5c1.5 1.5 3.4 2.3 5.5 2.3s4-.8 5.5-2.3V11M21.5 9v5" /></svg>
);
export const IconShare = () => (
  <svg {...base}><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" /></svg>
);
export const IconChat = () => (
  <svg {...base}><path d="M4 5.5h16v10H10l-4.5 3.5v-3.5H4Z" /><path d="M8 9.5h8M8 12.5h5" /></svg>
);
