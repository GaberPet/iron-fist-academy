// Attribution for the data sources and fonts.
export function CreditsPage() {
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Credits</h1>
          <p>Where the data, fonts and content come from.</p>
        </div>
      </div>
      <section className="card stack">
        <h2>Data and fonts</h2>
        <p className="dim">Frame data, combo routes and punisher tables: <a href="https://wavu.wiki" target="_blank" rel="noreferrer">Wavu Wiki</a> contributors, CC0. Fonts: Montserrat and Source Sans 3 (SIL Open Font License). 3D: <a href="https://threejs.org" target="_blank" rel="noreferrer">three.js</a> (MIT). The 3D fighters, arena, animations and sounds are original and generated in code. Fight mechanics follow Tekken 8's documented systems as described on Wavu Wiki. Lessons and coach notes: Iron Fist Academy contributors, CC BY-SA 4.0. Code: MIT.</p>
        <p className="dim">Iron Fist Academy is an unofficial fan project, not affiliated with or endorsed by Bandai Namco Entertainment. TEKKEN is their trademark. The site uses no game art.</p>
      </section>
    </div>
  );
}
