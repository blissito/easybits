import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { BlogContent, BlogHeader } from "./blog/BlogList";

export default function Blog() {
  return (
    <section className="overflow-hidden">
      <AuthNav />
      <BlogHeader />
      <BlogContent />
      <Footer />
    </section>
  );
}
