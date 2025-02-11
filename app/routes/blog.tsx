import { Banners, Robot } from "~/components/common/Banner";
import { BasicGallery } from "~/components/galleries/BasicGallery";
import { AuthNav } from "~/components/login/auth-nav";
import { Pricing } from "./plans/Pricing";
import { Benefits } from "./plans/Benefits";
import { Faq } from "./plans/Faq";
import { Footer } from "~/components/common/Footer";
import { cn } from "~/utils/cn";
import {
  MdKeyboardDoubleArrowLeft,
  MdKeyboardDoubleArrowRight,
} from "react-icons/md";

export default function Blog() {
  return (
    <section className="overflow-hidden">
      <AuthNav />
      <Header />
      <BlogContent />
      <Footer />
    </section>
  );
}

export const BlogContent = () => {
  return (
    <section className="">
      <div className="border-x-[1px] border-black  h-12 max-w-7xl mx-4 md:mx-[5%] xl:mx-auto "></div>
      <div className="border-y-[1px] border-black w-full h-fit lg:h-[72px] px-4 md:px-[5%] xl:px-0 ">
        <div className="border-x-[1px]  border-black w-full  h-full max-w-7xl flex-wrap lg:flex-nowrap  mx-auto flex justify-between gap-0 lg:gap-4 items-center pl-0 lg:pl-4">
          <div className="flex h-12 md:h-full items-center w-full lg:w-fit overflow-y-scroll border-b-[1px] border-black lg:border-none">
            <Chip category="Todos" />
            <Chip category="Noticias" />
            <Chip category="Educación" />
            <Chip category="Ingeniería" />
            <Chip category="Clientes" />
            <Chip category="EasyBits" />{" "}
          </div>
          <div className="bg-white w-full lg:w-96 h-12 lg:h-full flex">
            <input
              className="w-full h-full border-l-transparent md:border-l-black border-y-[0px]"
              placeholder="¿Qué quieres saber hoy?"
            />
            <button className="w-12 lg:w-[72px] border-none h-full bg-black grid place-content-center">
              <img alt="lupa" src="/search.svg" />
            </button>
          </div>
        </div>
      </div>
      <div className="border-x-[1px] border-black  min-h-screen max-w-7xl pt-12 lg:pt-20  mx-4 md:mx-[5%] xl:mx-auto">
        <BlogCard />
        <BlogCard />
        <BlogCard />
        <BlogCard />
        <BlogCard />
        <BlogCard />
        <BlogCard />
        <BlogCard />
      </div>
      <div className="border-y-[1px] border-black w-full h-10 px-4 md:px-[5%] xl:px-0">
        <div className="border-x-[1px] border-black  h-full max-w-7xl mx-auto flex justify-end  items-center pl-4">
          <div className="px-3 border-l-[1px] h-full grid place-content-center border-black">
            <p>1 de 20 </p>
          </div>
          <div className="w-10 hover:bg-black/80 cursor-pointer bg-black text-2xl text-white h-full grid place-content-center">
            <MdKeyboardDoubleArrowLeft />
          </div>
          <div className="w-10 hover:bg-black/80 cursor-pointer bg-black text-2xl text-white h-full grid place-content-center border-l-[1px] border-white/20">
            <MdKeyboardDoubleArrowRight />
          </div>
        </div>
      </div>
      <div className=" w-full h-12 lg:h-20 px-4 md:px-[5%] xl:px-0">
        <div className="border-x-[1px] border-black   h-full max-w-7xl mx-auto flex justify-between gap-4 items-center pl-4"></div>
      </div>
    </section>
  );
};

const BlogCard = ({ className }: { className?: string }) => {
  return (
    <section
      className={cn(
        "border-t-[1px] border-black p-4 md:p-6 flex-wrap md:flex-nowrap flex gap-8",
        className
      )}
    >
      <img
        src="https://images.pexels.com/photos/317356/pexels-photo-317356.jpeg?auto=compress&cs=tinysrgb&w=1200"
        className="w-full md:w-[240px]  object-cover rounded-xl]"
      />
      <div className="">
        <span className="text-brand-gray text-sm">Febrero 2025</span>
        <h3 className="text-xl font-bold mb-1">
          Reducing friction with video through Vercel
        </h3>
        <p className="text-iron">
          Lorem ipsum dolor sit amet consectetur. Vitae risus eget faucibus
          etiam leo augue. Vulputate sed pellentesque at donec. Tincidunt in
          justo eget porttitor ornare orci venenatis duis amet. Mi est accumsan
          porta cras justo ut nunc id. Dictum id habitant.
        </p>
        <div className="flex text-sm md:text-base mt-2 gap-2 items-center text-brand-gray">
          <img
            src="https://images.pexels.com/photos/317356/pexels-photo-317356.jpeg?auto=compress&cs=tinysrgb&w=1200"
            className="w-8 h-8 rounded-full border-[1px] border-black border-b-2"
          />
          <p>Pelusilla Lopez</p>
          <hr className="bg-brand-gray/50 w-[1px] h-3" />
          <p>2 min de lectura</p>
          <hr className="bg-brand-gray/50 w-[1px] h-3" />
          <p>Ingeniería</p>
        </div>
      </div>
    </section>
  );
};

const Chip = ({ category }: { category: string }) => {
  return (
    <div
      className={cn(
        "h-10 rounded-full border-[2px] grid place-content-center border-transparent w-fit px-3"
        // active && "border-black"
      )}
    >
      {category}
    </div>
  );
};
const Header = () => {
  return (
    <section className="pt-32 md:pt-[200px] mb-0  lg:mb-20 text-center relative">
      <img
        className="absolute left-80 md:left-20 lg:left-80 top-28 md:top-32"
        alt="star"
        src="/hero/star.svg"
      />
      <img
        className="absolute right-72 md:right-24 top-16 md:top-40 lg:right-80 w-16"
        alt="star"
        src="/hero/waves.svg"
      />
      <img
        className="absolute w-8 left-[480px] top-80 lg:top-96 xl:top-80"
        alt="star"
        src="/hero/asterisk.svg"
      />
      <div className="max-w-5xl mx-auto  px-4 md:px-[5%] xl:px-0">
        <h2 className="text-4xl lg:text-6xl font-bold">Blog</h2>
        <p className="text-iron text-xl lg:text-2xl mt-6">
          Echa un vistazo a todo lo que nuestro equipo de ingenieros y
          diseñadores quere compartirte.
        </p>
      </div>
    </section>
  );
};
