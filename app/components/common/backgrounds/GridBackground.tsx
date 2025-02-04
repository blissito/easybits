/**
 * Estos backgrounds son fixed e inset-0 con z-0
 * se emplean dentro de un padre relativo que debería cubrir:
 * 100% del ancho y 100% del alto dentro de una página.
 */
export const GridBackground = () => {
  return (
    <>
      <img
        src="/dash/grid.svg"
        alt="grid"
        className="absolute inset-0 object-cover min-h-screen pointer-events-none"
      />
      <section
        className="absolute inset-0 bg-white pointer-events-none z-0"
        style={{
          background: "radial-gradient(transparent, rgba(255,255,255,0.9) 33%)",
        }}
      ></section>
    </>
  );
};
