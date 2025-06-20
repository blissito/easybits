import {
  MdKeyboardDoubleArrowLeft,
  MdKeyboardDoubleArrowRight,
} from "react-icons/md";
import { Link } from "react-router";
import { cn } from "~/utils/cn";

export const BlogContent = () => {
  return (
    <section className="">
      <div className="border-x-[2px] border-black  h-12 max-w-7xl mx-4 md:mx-[5%] xl:mx-auto "></div>
      <div className="border-y-[2px] border-black w-full h-fit lg:h-[72px] px-4 md:px-[5%] xl:px-0 ">
        <div className="border-x-[2px]  border-black w-full  h-full max-w-7xl flex-wrap lg:flex-nowrap  mx-auto flex justify-between gap-0 lg:gap-4 items-center pl-0 lg:pl-4">
          <div className="flex h-12 md:h-full items-center w-full lg:w-fit overflow-x-scroll md:overflow-hidden border-b-[2px] border-black lg:border-none">
            <Chip category="Todos" />
            <Chip category="Noticias" />
            <Chip category="Educación" />
            <Chip category="Ingeniería" />
            <Chip category="Clientes" />
            <Chip category="EasyBits" />{" "}
          </div>
          <div className="bg-white w-full lg:w-96 h-12 lg:h-full flex">
            <input
              className="w-full h-full border-[0px]  md:border-l-black  md:border-l-[2px] border-r-[0px] border-y-none"
              placeholder="¿Qué quieres saber hoy?"
            />
            <button className="w-12 lg:w-[72px] border-none h-full bg-black grid place-content-center">
              <img alt="lupa" src="/blog/search.svg" />
            </button>
          </div>
        </div>
      </div>
      <div className="border-x-[2px] border-black  min-h-screen max-w-7xl pt-12 lg:pt-20  mx-4 md:mx-[5%] xl:mx-auto">
        <BlogCard />
        <BlogCard />
        <BlogCard />
        <BlogCard />
        <BlogCard />
        <BlogCard />
        <BlogCard />
        <BlogCard />
      </div>
      <Pagination />
      <div className=" w-full h-12 lg:h-20 px-4 md:px-[5%] xl:px-0">
        <div className="border-x-[2px] border-black   h-full max-w-7xl mx-auto flex justify-between gap-4 items-center pl-4"></div>
      </div>
    </section>
  );
};

export const Pagination = () => {
  return (
    <div className="border-y-[2px] border-black w-full h-10 px-4 md:px-[5%] xl:px-0">
      <div className="border-x-[2px] border-black  h-full max-w-7xl mx-auto flex justify-end  items-center pl-4">
        <div className="px-3 border-l-[2px] h-full grid place-content-center border-black">
          <p>1 de 20 </p>
        </div>
        <div className="w-10 hover:bg-black/80 cursor-pointer bg-black text-2xl text-white h-full grid place-content-center">
          <MdKeyboardDoubleArrowLeft />
        </div>
        <div className="w-10 hover:bg-black/80 cursor-pointer bg-black text-2xl text-white h-full grid place-content-center border-l-[2px] border-white/20">
          <MdKeyboardDoubleArrowRight />
        </div>
      </div>
    </div>
  );
};

export const BlogCard = ({ className }: { className?: string }) => {
  return (
    <Link to="/blogpost">
      <section
        className={cn(
          "border-t-[2px] border-black p-4 md:p-6 flex-wrap md:flex-nowrap hover:bg-grayLight flex gap-8 group transition-all cursor-pointer",
          className
        )}
      >
        <img
          src="https://images.pexels.com/photos/317356/pexels-photo-317356.jpeg?auto=compress&cs=tinysrgb&w=1200"
          className="w-full md:w-[240px]  object-cover rounded-xl]"
        />
        <div className="">
          <span className="text-brand-gray text-sm">Febrero 2025</span>
          <h3 className="text-xl font-bold mb-1 group-hover:underline ">
            Reducing friction with video through Vercel
          </h3>
          <p className="text-iron">
            Lorem ipsum dolor sit amet consectetur. Vitae risus eget faucibus
            etiam leo augue. Vulputate sed pellentesque at donec. Tincidunt in
            justo eget porttitor ornare orci venenatis duis amet. Mi est
            accumsan porta cras justo ut nunc id. Dictum id habitant.
          </p>
          <div className="flex text-sm md:text-base mt-2 gap-2 items-center text-brand-gray">
            <img
              src="https://images.pexels.com/photos/317356/pexels-photo-317356.jpeg?auto=compress&cs=tinysrgb&w=1200"
              className="w-8 h-8 rounded-full border-[2px] border-black border-b-2"
            />
            <p>Pelusilla Lopez</p>
            <hr className="bg-brand-gray/50 w-[1px] h-3" />
            <p>2 min de lectura</p>
            <hr className="bg-brand-gray/50 w-[1px] h-3" />
            <p>Ingeniería</p>
          </div>
        </div>
      </section>{" "}
    </Link>
  );
};

export const Chip = ({ category }: { category: string }) => {
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
export const BlogHeader = () => {
  return (
    <section className="pt-32 md:pt-[200px] mb-0  lg:mb-20 text-center relative">
      <img
        className="absolute left-96 md:left-20 lg:left-80 top-28 md:top-32 w-8 md:w-auto"
        alt="star"
        src="/home/star.svg"
      />
      <img
        className="absolute  right-96 md:right-24 top-16 md:top-40 lg:right-80 w-12 md:w-16"
        alt="waves"
        src="/home/waves.svg"
      />
      <img
        className="absolute hidden md:block w-8 left-[480px] top-80 lg:top-96 xl:top-80"
        alt="asterisk"
        src="/home/asterisk.svg"
      />
      <div className="max-w-5xl mx-auto  px-4 md:px-[5%] xl:px-0">
        <h2 className="text-4xl lg:text-6xl font-bold">Blog</h2>
        <p className="text-iron text-xl lg:text-2xl mt-4 md:mt-6">
          Echa un vistazo a todo lo que nuestro equipo de ingenieros y
          diseñadores quere compartirte.
        </p>
      </div>
    </section>
  );
};
