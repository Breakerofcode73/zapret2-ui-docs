export default function Page({ title, desc, children }) {
  return (
    <section className="page">
      <header className="page-h">
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </header>
      {children}
    </section>
  );
}