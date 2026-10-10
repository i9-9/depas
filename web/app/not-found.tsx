export default function NotFound() {
  return (
    <main className="page py-16">
      <h1 className="display text-title">No está esta página</h1>
      <p className="measure mt-4 text-ink">
        Volvé al <a href="/" className="link">departamento de ahora</a> o a{" "}
        <a href="/archivo/" className="link">todos</a>.
      </p>
    </main>
  );
}
