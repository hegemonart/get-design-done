import './App.css';

function Card({ title, body }) {
  return (
    /* BAN-01 seeded in CSS: .card has border-left: 4px solid var(--color-primary) */
    <div className="card">
      <h3 className="card__title">{title}</h3>
      <p className="card__body">{body}</p>
    </div>
  );
}

function App() {
  return (
    <div className="app">
      {/* AI-slop copy — verify should flag this */}
      <section className="hero">
        <h1 className="hero__title">
          Unlock your potential with our seamless, cutting-edge solution
        </h1>
        <p className="hero__subtitle">
          Leverage best-in-class technology to supercharge your workflow and
          drive synergistic outcomes at scale.
        </p>
        <button className="cta-button">Get Started Today</button>
      </section>

      <section className="features">
        <Card
          title="Blazing Fast"
          body="Industry-leading performance that scales effortlessly to meet your enterprise needs."
        />
        <Card
          title="Seamlessly Integrated"
          body="Connect with your existing tools through our best-in-class API ecosystem."
        />
        <Card
          title="AI-Powered Insights"
          body="Unlock actionable intelligence with cutting-edge machine learning algorithms."
        />
      </section>

      {/* Hardcoded color — bypasses token — verify should flag */}
      <footer className="footer" style={{ color: '#ff0000' }}>
        &copy; 2024 SynergyCloud Inc. All rights reserved.
      </footer>
    </div>
  );
}

export default App;
