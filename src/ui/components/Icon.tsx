// Line icons for the navigation (24px grid, stroke = currentColor).
const PATHS: Record<string, string> = {
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
  characters: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',
  academy: 'M3 9l9-5 9 5-9 5zm4 2.5V16c0 1.7 2.2 3 5 3s5-1.3 5-3v-4.5M21 9v6',
  moves: 'M5 5h14M5 10h14M5 15h14M5 20h9',
  combos: 'M13 3 5 14h6l-1 7 8-11h-6z',
  punish: 'M4 20 14 10m-3-3 6 6m-1-9 4 4-3 3-4-4z',
  install: 'M12 3v12m-5-5 5 5 5-5M4 19h16',
  matchup: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  dojo: 'M5 19 19 5M9 5H5v4m10 10h4v-4M5 5l5 5m4 4 5 5',
  fight: 'M7 11V7a2 2 0 0 1 4 0v4m0-1V6a2 2 0 0 1 4 0v5m0-2a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-2a2 2 0 0 1 4 0',
  updates: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
  companion: 'M3 5h18v11H3zM8 20h8m-4-4v4',
  controller: 'M7 9h10a4 4 0 0 1 3.9 4.8l-.7 3.4a2 2 0 0 1-3.5.8L15 16H9l-1.7 2a2 2 0 0 1-3.5-.8l-.7-3.4A4 4 0 0 1 7 9zm1 2.5v3M6.5 13h3M15.5 12.5h.01M17.5 14.5h.01',
  progress: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-3 2-1-2-4-2 .5-1.5-1.5L16 4l-4-1-1 2H9L8 3 4 5l.5 2L3 8.5 1 9v4l2 1 .5 2L2 18l3 3 2-1 1.5.5L9 22h4l1-2 1.5-.5 2 1 3-3-1-2 .5-1.5z',
};

export function Icon({ name }: { name: string }) {
  return (
    <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? PATHS.home} />
    </svg>
  );
}
