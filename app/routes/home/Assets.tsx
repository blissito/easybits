import { Card } from "./Card";

export const Assets = () => {
  return (
    <section className="max-w-7xl mx-auto py-20 md:py-40 px-4 md:px-[5%] xl:px-0">
      <h2 className="text-3xl md:text-5xl font-bold text-center mb-12 md:mb-20">
        Imagina todo lo que puedes vender en Easybits
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-6 md:gap-y-12">
        <Card className="bg-[#93E6EB]" />
        <Card className="bg-[#D4EB93]" />
        <Card className="bg-[#CDB8F9]" />
        <Card className="bg-[#DCE2F0]" />
        <Card className="bg-[#E0AC6E]" />
        <Card className="bg-[#FCCCBD]" />
        <Card className="bg-[#F7E1FD]" />
        <Card className="bg-[#B2DAD8]" />
        <Card className="bg-[#FADB6F]" />
      </div>
    </section>
  );
};
