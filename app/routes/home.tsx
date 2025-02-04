import { Link } from "react-router";

export default function Home() {
  return (
    <article className="grid place-content-center min-h-screen">
      <Link
        className="p-4 border rounded-lg bg-brand-500 hover:underline"
        to="/dash/assets"
      >
        Ir a tus assets
      </Link>
    </article>
  );
}
