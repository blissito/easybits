import { AuthNav } from "~/components/login/auth-nav";
import { PostHeader } from "./blog/PostHeader";
import { PostContent } from "./blog/PostContent";
import { SuscriptionBox } from "./blog/SuscriptionBox";
import { Footer } from "~/components/common/Footer";

export default function BlogPost() {
  return (
    <section className="overflow-hidden">
      <AuthNav />
      <div className="pt-32 md:pt-[200px]  pb-20 md:pb-32 max-w-7xl border-x-[1px] border-black mx-4 md:mx-[5%] xl:mx-auto px-4">
        <PostHeader />
        <PostContent />
        <SuscriptionBox />
      </div>
      <Footer />
    </section>
  );
}
