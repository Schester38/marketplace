import React from 'react';

const SVG_BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

const ic = (paths, opts = {}) => {
  const size = opts.size || 20;
  const style = opts.style;
  const fill = opts.fill;
  return (
    <svg
      {...SVG_BASE}
      width={size}
      height={size}
      style={style}
      {...(fill ? { fill: typeof fill === 'string' ? fill : 'currentColor', stroke: typeof fill === 'string' ? fill : SVG_BASE.stroke } : {})}
    >
      {paths}
    </svg>
  );
};

export const IconSearch = (o) => ic(<>
  <circle cx="11" cy="11" r="7" />
  <path d="m21 21-4.3-4.3" />
</>, o);

export const IconCart = (o) => ic(<>
  <circle cx="9" cy="21" r="1.4" />
  <circle cx="20" cy="21" r="1.4" />
  <path d="M2.5 2.5h3l2.7 12.4a2 2 0 0 0 2 1.6h9.6a2 2 0 0 0 2-1.5L22 7.5H6.2" />
</>, o);

export const IconHeart = (o) => ic(<>
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
</>, o);

export const IconHeartFilled = (o) => ic(<>
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
</>, { ...o, fill: true });

export const IconUser = (o) => ic(<>
  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
  <circle cx="12" cy="7" r="4" />
</>, o);

export const IconUserCheck = (o) => ic(<>
  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
  <circle cx="8.5" cy="7" r="4" />
  <path d="m17 11 2 2 4-4" />
</>, o);

export const IconHome = (o) => ic(<>
  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  <path d="M9 22V12h6v10" />
</>, o);

export const IconMenu = (o) => ic(<>
  <path d="M3 6h18" />
  <path d="M3 12h18" />
  <path d="M3 18h18" />
</>, o);

export const IconClose = (o) => ic(<>
  <path d="M18 6 6 18" />
  <path d="m6 6 12 12" />
</>, o);

export const IconChevronLeft = (o) => ic(<path d="m15 18-6-6 6-6" />, o);
export const IconChevronRight = (o) => ic(<path d="m9 18 6-6-6-6" />, o);
export const IconChevronDown = (o) => ic(<path d="m6 9 6 6 6-6" />, o);
export const IconChevronUp = (o) => ic(<path d="m18 15-6-6-6 6" />, o);

export const IconStar = (o) => ic(<>
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
</>, { ...o, fill: true, strokeWidth: 1 });

export const IconStarFilled = IconStar;

export const IconSun = (o) => ic(<>
  <circle cx="12" cy="12" r="4" />
  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
</>, o);

export const IconMoon = (o) => ic(<>
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
</>, o);

export const IconSignal = (o) => ic(<>
  <path d="M2 20h3V10H2zM8.5 20h3V4h-3zM15 20h3V12h-3zM21.5 20H22V8h-3.5v12z" />
</>, o);

export const IconStarOutline = (o) => ic(<>
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
</>, o);

export const IconShield = (o) => ic(<>
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
</>, o);

export const IconShieldCheck = (o) => ic(<>
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  <path d="m9 12 2 2 4-4" />
</>, o);

export const IconTruck = (o) => ic(<>
  <path d="M1 3h15v13H1z" />
  <path d="M16 8h4l3 3v5h-7z" />
  <circle cx="5.5" cy="18.5" r="2.5" />
  <circle cx="18.5" cy="18.5" r="2.5" />
</>, o);

export const IconPackage = (o) => ic(<>
  <path d="m16.5 9.4-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  <path d="M3.27 6.96 12 12.01l8.73-5.05" />
  <path d="M12 22.08V12" />
</>, o);

export const IconBanknote = (o) => ic(<>
  <rect x="2" y="6" width="20" height="12" rx="2" />
  <circle cx="12" cy="12" r="3" />
  <path d="M6 10h.01" />
  <path d="M18 14h.01" />
</>, o);

export const IconPercentage = (o) => ic(<>
  <path d="M19 5 5 19" />
  <circle cx="6.5" cy="6.5" r="2.5" />
  <circle cx="17.5" cy="17.5" r="2.5" />
</>, o);

export const IconBolt = (o) => ic(<>
  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
</>, { ...o, fill: true, strokeWidth: 1 });

export const IconShare = (o) => ic(<>
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  <polyline points="17 8 12 3 7 8" />
  <line x1="12" y1="3" x2="12" y2="15" />
</>, o);

export const IconWhatsApp = (o) => ic(<>
  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.454.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.194 1.871.18.297-.008 1.757-.868 2.006-1.973.248-1.104.174-2.275-.372-3.26-.173-.32-.32-.615-.42-.814-.099-.198-.148-.372-.198-.545-.049-.174-.198-.52-.198-1.043z" />
</>, { ...o, fill: true, strokeWidth: 0.5 });

export const IconEye = (o) => ic(<>
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
  <circle cx="12" cy="12" r="3" />
</>, o);

export const IconEyeOff = (o) => ic(<>
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
  <path d="m1 1 23 23" />
</>, o);

export const IconPlus = (o) => ic(<>
  <path d="M12 5v14" />
  <path d="M5 12h14" />
</>, o);

export const IconMinus = (o) => ic(<path d="M5 12h14" />, o);

export const IconTrash = (o) => ic(<>
  <path d="M3 6h18" />
  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  <path d="M10 11v6" />
  <path d="M14 11v6" />
</>, o);

export const IconEdit = (o) => ic(<>
  <path d="M12 20h9" />
  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
</>, o);

export const IconSettings = (o) => ic(<>
  <circle cx="12" cy="12" r="3" />
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
</>, o);

export const IconBell = (o) => ic(<>
  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
</>, o);

export const IconGlobe = (o) => ic(<>
  <circle cx="12" cy="12" r="10" />
  <path d="M2 12h20" />
  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
</>, o);

export const IconPhone = (o) => ic(<>
  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
</>, o);

export const IconMail = (o) => ic(<>
  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
  <path d="m22 6-10 7L2 6" />
</>, o);

export const IconMapPin = (o) => ic(<>
  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
  <circle cx="12" cy="10" r="3" />
</>, o);

export const IconGrid = (o) => ic(<>
  <rect x="3" y="3" width="7" height="7" />
  <rect x="14" y="3" width="7" height="7" />
  <rect x="14" y="14" width="7" height="7" />
  <rect x="3" y="14" width="7" height="7" />
</>, o);

export const IconList = (o) => ic(<>
  <path d="M8 6h13" />
  <path d="M8 12h13" />
  <path d="M8 18h13" />
  <path d="M3 6h.01" />
  <path d="M3 12h.01" />
  <path d="M3 18h.01" />
</>, o);

export const IconArrowUp = (o) => ic(<path d="M12 19V5M5 12l7-7 7 7" />, o);

export const IconCheck = (o) => ic(<path d="M20 6 9 17l-5-5" />, o);

export const IconX = (o) => ic(<>
  <path d="M18 6 6 18" />
  <path d="m6 6 12 12" />
</>, o);

export const IconLayers = (o) => ic(<>
  <path d="m12 2 10 6.13L22 8.65" />
  <path d="m2 8.65 10-6.52" />
  <path d="m2 15.5 10 6.13 10-6.13" />
  <path d="m2 12 10 6.13L22 12" />
</>, o);

export const IconTag = (o) => ic(<>
  <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
  <line x1="7" y1="7" x2="7.01" y2="7" />
</>, o);

export const IconFire = (o) => ic(<>
  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
</>, { ...o, fill: true, strokeWidth: 1 });

export const IconTrendingUp = (o) => ic(<>
  <path d="m23 6-9.5 9.5-5-5L1 18" />
  <path d="M17 6h6v6" />
</>, o);

export const IconClock = (o) => ic(<>
  <circle cx="12" cy="12" r="10" />
  <path d="M12 6v6l4 2" />
</>, o);

export const IconRefresh = (o) => ic(<>
  <path d="M23 4v6h-6" />
  <path d="M1 20v-6h6" />
  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
</>, o);

export const IconDownload = (o) => ic(<>
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  <polyline points="7 10 12 15 17 10" />
  <line x1="12" y1="15" x2="12" y2="3" />
</>, o);

export const IconZoomIn = (o) => ic(<>
  <circle cx="11" cy="11" r="8" />
  <line x1="21" y1="21" x2="16.65" y2="16.65" />
  <line x1="11" y1="8" x2="11" y2="14" />
  <line x1="8" y1="11" x2="14" y2="11" />
</>, o);

export const IconImage = (o) => ic(<>
  <rect x="3" y="3" width="18" height="18" rx="2" />
  <circle cx="8.5" cy="8.5" r="1.5" />
  <path d="m21 15-5-5L5 21" />
</>, o);

export const IconChartBar = (o) => ic(<>
  <line x1="12" y1="20" x2="12" y2="10" />
  <line x1="18" y1="20" x2="18" y2="4" />
  <line x1="6" y1="20" x2="6" y2="16" />
</>, o);

export const IconDollar = (o) => ic(<>
  <line x1="12" y1="1" x2="12" y2="23" />
  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
</>, o);

export const IconUsers = (o) => ic(<>
  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
  <circle cx="9" cy="7" r="4" />
  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
</>, o);

export const IconStore = (o) => ic(<>
  <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
  <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
  <path d="M2 7h20" />
  <path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63h0v0a2.7 2.7 0 0 0-3.18 0v0a2.7 2.7 0 0 1-1.59.63h0a2.7 2.7 0 0 1-1.59-.63v0a2.7 2.7 0 0 0-3.18 0v0a2.7 2.7 0 0 1-1.59.63v0a2 2 0 0 1-2-2V7" />
</>, o);

export const IconAward = (o) => ic(<>
  <circle cx="12" cy="8" r="7" />
  <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
</>, o);

export const IconLock = (o) => ic(<>
  <rect x="3" y="11" width="18" height="11" rx="2" />
  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
</>, o);

export const IconHelp = (o) => ic(<>
  <circle cx="12" cy="12" r="10" />
  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
  <path d="M12 17h.01" />
</>, o);

export const IconSortAsc = (o) => ic(<>
  <path d="M3 6h13M3 12h9M3 18h5" />
  <path d="m17 10 4 4 4-4" />
  <path d="M21 14v6" />
</>, o);

export const IconSortDesc = (o) => ic(<>
  <path d="M3 6h13M3 12h9M3 18h5" />
  <path d="m17 14 4-4 4 4" />
  <path d="M21 10V4" />
</>, o);

export const IconLogout = (o) => ic(<>
  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
  <polyline points="16 17 21 12 16 7" />
  <line x1="21" y1="12" x2="9" y2="12" />
</>, o);

export const IconGift = (o) => ic(<>
  <polyline points="20 12 20 22 4 22 4 12" />
  <rect x="2" y="7" width="20" height="5" />
  <line x1="12" y1="22" x2="12" y2="7" />
  <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
  <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
</>, o);

export const IconCopy = (o) => ic(<>
  <rect x="9" y="9" width="13" height="13" rx="2" />
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
</>, o);

export const IconCpu = (o) => ic(<>
  <rect x="4" y="4" width="16" height="16" rx="2" />
  <rect x="9" y="9" width="6" height="6" />
  <path d="M9 1v3" />
  <path d="M15 1v3" />
  <path d="M9 20v3" />
  <path d="M15 20v3" />
  <path d="M20 9h3" />
  <path d="M20 14h3" />
  <path d="M1 9h3" />
  <path d="M1 14h3" />
</>, o);

export const IconShirt = (o) => ic(<>
  <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
</>, o);

export const IconHome2 = (o) => ic(<>
  <path d="m3 12 9-9 9 9" />
  <path d="M5 10v10h14V10" />
  <path d="M10 20v-6h4v6" />
</>, o);

export const IconCar = (o) => ic(<>
  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-1.3-3.9C16.4 5.4 15.7 5 15 5H9c-.7 0-1.4.4-1.7 1.1L6 10l-1.5.1c-.8.2-1.5 1-1.5 1.9v3c0 .6.4 1 1 1h2" />
  <circle cx="7" cy="17" r="2" />
  <circle cx="17" cy="17" r="2" />
</>, o);

export const IconSofa = (o) => ic(<>
  <path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" />
  <path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z" />
  <path d="M4 18v2" />
  <path d="M20 18v2" />
</>, o);

export const IconUtensils = (o) => ic(<>
  <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
  <path d="M7 2v20" />
  <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
</>, o);

export const IconDumbbell = (o) => ic(<>
  <path d="m6.5 6.5 11 11" />
  <path d="m21 21-1-1" />
  <path d="m3 3 1 1" />
  <path d="m18 22 4-4" />
  <path d="m2 6 4-4" />
  <path d="m3 10 7-7" />
  <path d="m14 21 7-7" />
</>, o);

export const IconWrench = (o) => ic(<>
  <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6.5 6.5a2.12 2.12 0 0 0 3 3l6.5-6.5a4 4 0 0 0 5.4-5.4l-2.8 2.8-2.2-.6-.6-2.2Z" />
</>, o);

export const IconGamepad = (o) => ic(<>
  <line x1="6" y1="12" x2="10" y2="12" />
  <line x1="8" y1="10" x2="8" y2="14" />
  <line x1="15" y1="13" x2="15.01" y2="13" />
  <line x1="18" y1="11" x2="18.01" y2="11" />
  <rect x="2" y="6" width="20" height="12" rx="6" />
</>, o);

export const IconBook = (o) => ic(<>
  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
</>, o);

export const IconMusic = (o) => ic(<>
  <path d="M9 18V5l12-2v13" />
  <circle cx="6" cy="18" r="3" />
  <circle cx="18" cy="16" r="3" />
</>, o);

export const IconPalette = (o) => ic(<>
  <circle cx="13.5" cy="6.5" r=".5" />
  <circle cx="17.5" cy="10.5" r=".5" />
  <circle cx="8.5" cy="7.5" r=".5" />
  <circle cx="6.5" cy="12.5" r=".5" />
  <path d="M12 2a10 10 0 0 1 0 20H9.5a2.5 2.5 0 0 1-2.5-2.5v-.28a4.5 4.5 0 0 1 3.5-4.43L12 12.5v-.13A4.37 4.37 0 0 0 7.63 8C5.5 8 4 6 4 4a10 10 0 0 1 8-10z" />
</>, o);

export const IconBrush = (o) => ic(<>
  <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
  <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
</>, o);

export const IconLeaf = (o) => ic(<>
  <path d="M11 20A7 7 0 0 1 4 13c0-4 3-9 9-10 1 5-.5 9-4 10" />
  <path d="M2 22c1-4 5-7 8-8" />
</>, o);

export const IconBaby = (o) => ic(<>
  <path d="M9 12h.01" />
  <path d="M15 12h.01" />
  <path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" />
  <path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1" />
</>, o);

export const IconTv = (o) => ic(<>
  <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
  <polyline points="17 2 12 7 7 2" />
</>, o);

export const IconSmartphone = (o) => ic(<>
  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
  <line x1="12" y1="18" x2="12.01" y2="18" />
</>, o);

export const IconWatch = (o) => ic(<>
  <circle cx="12" cy="12" r="5.6" />
  <polyline points="12 10 12 12 13.4 12.8" />
  <path d="M15.9 7.2 15.2 3.6A2 2 0 0 0 13.24 2h-2.48a2 2 0 0 0-1.96 1.6L8.1 7.2" />
  <path d="m8.1 16.8.7 3.6a2 2 0 0 0 1.96 1.6h2.48a2 2 0 0 0 1.96-1.6l.7-3.6" />
</>, o);

export const IconShoppingBag = (o) => ic(<>
  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
  <line x1="3" y1="6" x2="21" y2="6" />
  <path d="M16 10a4 4 0 0 1-8 0" />
</>, o);

export const IconWallet = (o) => ic(<>
  <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
  <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
  <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
</>, o);

export const IconHeadphones = (o) => ic(<>
  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
</>, o);

export const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export const CATEGORY_ICONS = {
  /* Groupes historiques */
  'Électronique': IconCpu,
  'Mode': IconShirt,
  'Maison & Déco': IconSofa,
  'Beauté & Santé': IconHeart,
  'Sport & Loisirs': IconDumbbell,
  'Auto & Moto': IconCar,
  'Alimentation': IconUtensils,
  'Bricolage': IconWrench,
  'Jouets & Enfants': IconBaby,
  'Livres & Culture': IconBook,
  'Services': IconSettings,
  'Créateurs': IconPalette,
  /* Catégories réelles (PRODUCT_CATEGORIES) */
  'Électronique & Téléphones': IconSmartphone,
  'Téléphones & Tablettes': IconSmartphone,
  'Ordinateurs & Accessoires': IconCpu,
  'TV, Audio & Vidéo': IconTv,
  'Consoles & Jeux vidéo': IconGamepad,
  'Mode & Vêtements': IconShirt,
  'Chaussures': IconShoppingBag,
  'Sacs & Accessoires': IconShoppingBag,
  'Beauté & Cosmétiques': IconBrush,
  'Parfums': IconLeaf,
  'Soins capillaires': IconBrush,
  'Bijoux & Montres': IconWatch,
  'Meubles': IconSofa,
  'Cuisine & Ustensiles': IconUtensils,
  'Linge de maison': IconHome,
  'Électroménager': IconBolt,
  'Alimentation & Épicerie': IconUtensils,
  'Produits frais & Marché': IconLeaf,
  'Boissons': IconUtensils,
  'Santé & Bien-être': IconHeart,
  'Sport & Fitness': IconDumbbell,
  'Jouets & Jeux': IconGamepad,
  'Bébé & Enfants': IconBaby,
  'Papeterie & Bureau': IconEdit,
  'Livres & Formation': IconBook,
  'Arts & Artisanat': IconPalette,
  'Jardin & Extérieur': IconLeaf,
  'Animaux & Accessoires': IconHeart,
  'Services & Prestations': IconSettings,
  'Immobilier': IconHome,
};

export const getCategoryIcon = (name, size = 28) => {
  const Comp = CATEGORY_ICONS[name] || IconLayers;
  return <Comp size={size} />;
};
