import { Tag } from "~/components/common/Tag";
import { cn } from "~/utils/cn";

export const EventInfo = () => {
  return (
    <article
      className={cn(
        "w-full flex justify-between pr-0 flex-col mb-4 h-fit",
        "lg:pr-[300px] md:flex-row"
      )}
    >
      <div>
        <h3 className="text-white text-2xl mt-3">Webinar:Aprende React</h3>
        <p className="text-tale font-light mt-1">28 Marzo 2025, 14:00 hrs, </p>
      </div>
      <div className="flex flex-wrap gap-2 lg:gap-3 items-center mt-4 md:mt-0">
        <Tag variant="dark" label="Webinar" />
        <Tag variant="dark" label="En vivo" />
        <Tag variant="dark" label="React" />
        <Tag variant="dark" label="Rr7" />
      </div>
    </article>
  );
};
export const TransmisionBox = () => {
  return (
    <div
      className={cn(
        "bg-linear-to-r from-indigo-500 via-brand-500 to-[#C58D99] h-[280px]  grow w-full rounded-2xl  grid place-content-center ",
        "md:h-[400px] lg:h-[78vh] lg:rounded-r-none lg:rounded-l-2xl"
      )}
    >
      <span className="text-white text-5xl">
        Inicia en 23 días 13 hrs 46 minutos
      </span>
    </div>
  );
};
