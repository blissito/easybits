import { FaArrowLeft } from "react-icons/fa";

export const PostHeader = () => {
  return (
    <section className="max-w-3xl relative mx-auto border-b border-b-black md:pb-10 pb-8 mb-8 md:mb-10">
      <button className="absolute -left-16 top-10 text-xl  border-2 border-transparent hover:border-black w-12 h-12 rounded-lg grid place-content-center">
        <FaArrowLeft />
      </button>
      <span className="text-brand-gray text-sm">
        Febrero 2025 (hace 7 días)
      </span>

      <h3 className="text-3xl md:text-5xl font-bold mb-1 group-hover:underline leading-snug! ">
        Reducing friction with video through Vercel
      </h3>
      <div className="flex text-sm md:text-lg mt-2 gap-2 items-center text-iron">
        <img
          src="https://images.pexels.com/photos/317356/pexels-photo-317356.jpeg?auto=compress&cs=tinysrgb&w=1200"
          className="w-8 h-8 md:w-14 md:h-14 rounded-full border border-black border-b-2"
        />
        <p>Pelusilla Lopez</p>
        <hr className="bg-brand-gray/50 w-px h-3" />
        <p>2 min de lectura</p>
        <hr className="bg-brand-gray/50 w-px h-3" />
        <p>Ingeniería</p>
      </div>
    </section>
  );
};
