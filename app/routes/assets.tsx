export default function Assets() {
  return (
    <article
      className="py-20 px-10 min-h-screen w-full relative box-border inline-block"
      style={{
        backgroundImage: "url('/dash/grid.svg')",
      }}
    >
      <section
        className="absolute inset-0 bg-white"
        style={{
          background: "radial-gradient(transparent, rgba(255,255,255,0.9) 40%)",
        }}
      />

      <h1 className="text-3xl relative z-20">Mis assets digitales</h1>
    </article>
  );
}
