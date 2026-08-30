/** Inline stroke icons — no icon library, so the bundle stays small. */
const s = (p) => ({
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", ...p,
});

export const Search = (p) => (
  <svg {...s(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const Send = (p) => (
  <svg {...s(p)}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
);
export const Users = (p) => (
  <svg {...s(p)}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
export const Chats = (p) => (
  <svg {...s(p)}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg>
);
export const UserPlus = (p) => (
  <svg {...s(p)}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
);
export const Logout = (p) => (
  <svg {...s(p)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
);
export const Moon = (p) => (
  <svg {...s(p)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
);
export const Sun = (p) => (
  <svg {...s(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const Back = (p) => (
  <svg {...s(p)}><path d="m15 18-6-6 6-6" /></svg>
);
export const Check = (p) => (
  <svg {...s(p)}><path d="M20 6 9 17l-5-5" /></svg>
);
export const X = (p) => (
  <svg {...s(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const Plus = (p) => (
  <svg {...s(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const Trash = (p) => (
  <svg {...s(p)}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
);
export const Reply = (p) => (
  <svg {...s(p)}><path d="M9 17 4 12l5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
);

/** Single tick (sent) / double tick (delivered) / blue double tick (read). */
export const Ticks = ({ read = false, double = true, className = "" }) => (
  <svg viewBox="0 0 18 12" className={className} fill="none"
       stroke={read ? "#53bdeb" : "currentColor"} strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 6.5 4.2 9.8 10.5 2.2" />
    {double && <path d="M7 6.5l3.2 3.3L16.5 2.2" />}
  </svg>
);
