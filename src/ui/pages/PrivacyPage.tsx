// Privacy policy. Keep it in step with what the code actually stores (LoginGate consent table, runtime/storage).
export function PrivacyPage() {
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Privacy policy</h1>
          <p>Last updated 29 October 2026.</p>
        </div>
      </div>

      <section className="card stack">
        <h2>The short version</h2>
        <p>Iron Fist Academy has no accounts, no cookies, no analytics, no trackers and no adverts. Your players and training progress stay on your own device, unless you turn on sync between devices. We never sell or share them.</p>
      </section>

      <section className="card stack">
        <h2>What is stored on your device</h2>
        <p>Only if you choose “Allow saving” on the first visit, the website keeps these items in your browser's local storage:</p>
        <ul>
          <li><b>Players list:</b> the player names you create, so they appear on the sign-in page.</li>
          <li><b>Progress, settings and move edits:</b> each player's academy progress, settings and the frame data corrections they make.</li>
          <li><b>Signed-in player:</b> kept in session storage and removed when you close the tab.</li>
          <li><b>Sound on or off:</b> your fight sound setting.</li>
          <li><b>Your storage choice:</b> stored even if you choose “Don't save anything”, so you aren't asked on every visit.</li>
        </ul>
        <p>If you choose “Don't save anything”, the site still works, but everything is held in memory and lost when you close the tab. Player names are not passwords. Anyone using the same browser can open any player.</p>
        <p>On a phone, the website also keeps an offline copy of its own files and frame data (no personal data) so the installed app works without internet.</p>
        <p>The desktop app saves the same data as files in its data folder on your computer instead (see Settings and data). It doesn't ask for consent because the files never leave your computer.</p>
      </section>

      <section className="card stack">
        <h2>What leaves your device</h2>
        <p><b>Send to phone</b> puts your progress (lessons, combos, recent attempts and your player name) inside a QR code. The phone reads it from the link's # part, which browsers never send to the website's server.</p>
        <p><b>Sync between devices (only if you turn it on in Settings):</b> that player's progress (lessons, combos, attempts and practice time) and player name are stored in our database at Supabase, under a private random sync code. There is no email or account. The database cannot be listed or searched; it only answers a device that has the exact code. Turning sync off on every device stops it; ask through the project's GitHub page if you want the stored copy deleted.</p>
        <p>Apart from sync and Send to phone, nothing you enter or practise is sent anywhere. Controller and keyboard input is read in your browser and never transmitted.</p>
        <p>The website is hosted on GitHub Pages. Like any web host, GitHub receives standard request details when your browser loads the site, such as your IP address and browser type, and may log them for security. That is covered by <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noreferrer">GitHub's privacy statement</a>. Fonts, frame data and 3D models all come from the same site, with no third-party services. The desktop app checks the same site for frame data updates.</p>
      </section>

      <section className="card stack">
        <h2>Your choices</h2>
        <ul>
          <li>Change your storage choice any time in <a href="#/settings">Settings and data</a>.</li>
          <li>Download your progress as a file from the <a href="#/progress">Progress</a> page.</li>
          <li>Delete one player, or everything, in <a href="#/settings">Settings and data</a>. Clearing this site's data in your browser settings does the same. Turning saving off does not delete what is already saved.</li>
        </ul>
      </section>

      <section className="card stack">
        <h2>Children</h2>
        <p>The site collects no personal data from anyone, children included. A player name can be any nickname, so there's no need to use a real name.</p>
      </section>

      <section className="card stack">
        <h2>Changes and contact</h2>
        <p>If what the site stores changes, this page and the consent screen will be updated and the date above will change. Questions: open an issue on the <a href="https://github.com/GaberPet/iron-fist-academy/issues" target="_blank" rel="noreferrer">project's GitHub page</a>.</p>
      </section>
    </div>
  );
}
