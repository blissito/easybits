import { BrutalButton } from "~/components/common/BrutalButton";

export const DownloablePreview = () => {
  return (
    <section className="border my-10 md:mt-0 border-white max-w-3xl rounded-2xl mx-auto flex flex-wrap md:flex-nowrap h-fit md:h-[600px] overflow-hidden ">
      <div className="w-full md:w-[50%] h-full bg-slate-600">
        <img
          className="h-full w-full object-cover"
          src="https://images.pexels.com/photos/941555/pexels-photo-941555.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
        />
      </div>
      <div className="w-full md:w-[50%] h-full flex flex-col justify-between">
        <div className="p-4 md:p-6 h-full">
          <h3 className="text-white font-bold text-2xl">Template UI</h3>
          <p className="text-tale font-light mt-3">
            Lorem ipsum dolor sit amet consectetur. Quis a amet sed egestas
            semper vestibulum morbi egestas amet. Mattis habitant a erat
            bibendum est purus pharetra at a. Lorem ipsum dolor sit amet
            consectetur. Quis a amet sed egestas semper vestibulum morbi egestas
            amet. Mattis habitant a erat bibendum est purus pharetra at a.
          </p>
          <p className="text-tale font-light mt-3">Archivo .fig | 10 mb </p>
        </div>
        <div className="flex gap-2 items-center h-fit px-4 md:px-6 py-4">
          <img
            className="w-10 h-10 rounded-full"
            src="https://images.pexels.com/photos/4839763/pexels-photo-4839763.jpeg?auto=compress&cs=tinysrgb&w=1200"
          />
          <p className="text-tale font-light">Lucía López</p>
        </div>
        <div>
          <div className="border-t border-white py-3 px-4">
            <BrutalButton
              containerClassName="w-full"
              className="min-w-full bg-yellow-500 w-full "
            >
              Agregar reseña
            </BrutalButton>
          </div>
          <div className="border-t border-white py-3 px-4">
            <BrutalButton
              type="button"
              className="w-full"
              containerClassName="w-full"
            >
              Descargar
            </BrutalButton>
          </div>
        </div>
      </div>
    </section>
  );
};
