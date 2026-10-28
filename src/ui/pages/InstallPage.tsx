// "Install the app": downloads of the desktop builds from the latest GitHub release (website only).
const REPO = 'https://github.com/GaberPet/iron-fist-academy';
const dl = (file: string) => `${REPO}/releases/latest/download/${file}`;

const DOWNLOADS = [
  { title: 'Windows installer', file: 'Iron-Fist-Academy-Setup.exe', note: 'Recommended for Windows 10 and 11. Adds a Start menu entry and a normal uninstaller.' },
  { title: 'Windows portable', file: 'Iron-Fist-Academy-Portable.exe', note: 'One file, no installation. Good for a USB stick. To remove it, delete the file.' },
  { title: 'Linux AppImage', file: 'Iron-Fist-Academy.AppImage', note: 'Works on most Linux distributions. Make it executable, then double-click it.' },
];

export function InstallPage() {
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Install the app</h1>
          <p>Play offline. The desktop app has everything this website has, with all frame data built in, so it works without internet. It checks for new frame data when you are online.</p>
        </div>
      </div>

      <div className="download-grid">
        {DOWNLOADS.map((d) => (
          <section key={d.file} className="card stack">
            <h2>{d.title}</h2>
            <p className="small">{d.note}</p>
            <a className="btn primary" href={dl(d.file)} rel="noreferrer">Download {d.file.endsWith('.AppImage') ? 'for Linux' : 'for Windows'}</a>
            <span className="small muted mono">{d.file}</span>
          </section>
        ))}
      </div>

      <section className="card stack">
        <h2>Safe to install</h2>
        <ul>
          <li><b>No game files touched.</b> The app never reads, changes or connects to Tekken 8. It only reads your controller, like the website, so it does not interact with Tekken 8's anti-cheat.</li>
          <li><b>Open source.</b> Every download is built by GitHub from the public code, which anyone can check: <a href={REPO} target="_blank" rel="noreferrer">GaberPet/iron-fist-academy</a>.</li>
          <li><b>Windows "unknown publisher" warning.</b> The app is not signed with a paid code-signing certificate, so Windows SmartScreen may say "Windows protected your PC". Click <b>More info</b>, then <b>Run anyway</b>. This is normal for small, unsigned apps.</li>
          <li><b>Linux.</b> After downloading, right-click the file, open Properties and allow running it as a program (or run <span className="mono">chmod +x Iron-Fist-Academy.AppImage</span>).</li>
          <li><b>Uninstall any time</b> with the red Uninstall button at the bottom of the app's sidebar.</li>
        </ul>
        <p className="small muted">Your progress in the app is separate from your progress on this website. Move it with Export and Import on the Progress page. All releases: <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">GitHub releases</a>.</p>
      </section>
    </div>
  );
}
