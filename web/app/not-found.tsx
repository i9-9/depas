export default function NotFound() {
  return (
    <main className="page py-16">
      <h1 className="display text-[48px]">No está esta página</h1>
      <p className="mt-4 text-[14px] text-quiet">
        Volvé al <a href="/" className="underline">candidato</a> o a la{" "}
        <a href="/archivo/" className="underline">lista</a>.
      </p>
    </main>
  );
}
