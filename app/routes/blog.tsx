import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { BlogContent, BlogHeader } from "./blog/BlogList";
import type { Route } from "./+types/blog";
import getBasicMetaTags from "~/utils/getBasicMetaTags";

export const clientLoader = async () => {
  const user = await fetch("/api/v1/user?intent=self").then((r) => r.json());
  return { user };
};

export const meta = () =>
  getBasicMetaTags({
    title: "Consejos de Marketing + Negocios para creadores",
    description:
      "Ve por tu café, toma asiento y descubre como impulsar tu negocio crativo",
  });
export default function Blog({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <section className="overflow-hidden">
      <AuthNav user={user} />
      <BlogHeader />
      <BlogContent />
      <Footer />
    </section>
  );
}
