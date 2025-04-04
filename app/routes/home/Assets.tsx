import { Card } from "./Card";

export const Assets = () => {
  return (
    <section className="max-w-7xl mx-auto py-20 md:py-40 px-4 md:px-[5%] xl:px-0">
      <h2 className="text-3xl md:text-5xl font-bold text-center mb-12 md:mb-20">
        Imagina todo lo que puedes vender en Easybits
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-6 md:gap-y-12">
        <Card
          img="/hero/book.svg"
          title="Libros"
          description="Vende tu primer libro del tema que más te apasiona. Cocina, ciencia ficción, romance o comedia. "
          className="bg-[#93E6EB]"
          tags={["Cocina", "Porgramación", "Comedia"]}
        />
        <Card
          img="/hero/art.svg"
          title="Diseño "
          description="Comparte tu trabajo creativo, ya sea tu set de iconos, ilustraciones o modelado 3d, o simplemente tus dibujos."
          className="bg-[#D4EB93]"
          tags={["Ilustración", "Modelado 3d", "Iconofragía"]}
        />
        <Card
          img="/hero/camera.svg"
          title="Fotografía"
          description="Que tu fotografía profesional llegue más lejos, publícala y seguro habrá miles de personas que les encantará."
          className="bg-[#CDB8F9]"
          tags={["Paisajes", "Stocks", "Mockups"]}
        />
        <Card
          img="/hero/course.svg"
          title="Cursos"
          description="Llegó el momento de que tus cursos de idiomas, matemáticas, programación, cocina, pintura y más, se vean en todo el mundo."
          className="bg-[#DCE2F0]"
          tags={["Inglés", "Diseño", "Artes"]}
        />
        <Card
          img="/hero/micro.svg"
          title="Conferencias y Webinars"
          description="Que tus conferencias o webinars no sean pasajeras, conviértelos en un asset permanente compartiendo tu conocimiento con tus seguidores."
          className="bg-[#E0AC6E]"
          tags={["Masterclass", "Webinars"]}
        />
        <Card
          img="/hero/audio.svg"
          title="Audio y Música"
          description="Tonos, canciones, poesía, intros, tracks de meditación o historias de miedo, y todo lo que puedas imaginar. "
          className="bg-[#FCCCBD]"
          tags={["Ring tones", "Meditación", "Soundtracks"]}
        />
        <Card
          title="Diseño UI"
          description="Vende tus mockups, templates o sistemas de diseño, es hora de que tu diseño sea usado por cientos de negocios allí afuera."
          className="bg-[#F7E1FD]"
          tags={["Mockups", "Apps", "Componentes"]}
        />
        <Card
          img="/hero/code.svg"
          title="Desarrollo de Software"
          description="Vende proyectos, componentes, templates o herramientas que ayuden a otros a crear software de forma más rápida."
          className="bg-[#B2DAD8]"
          tags={["Templates", "Componentes"]}
        />
        <Card
          img="/hero/cloud.svg"
          title="Cuentos e historias"
          description="Que tus historias, cuentos, poemas, ensayos o reflexiones cautiven a miles de lectores alrededor del mundo. "
          className="bg-[#FADB6F]"
          tags={["Poemas", "Cuentos cortos", "Comics"]}
        />
        {/* <Card
          title="Hojas de cálculo"
          description="Súmate al mercado "
          className="bg-[#D2A350]"
        />
        <Card title="Plantillas de presentaciones" className="bg-brand-grass" />
        <Card title="Modelado 3d" className="bg-[#E1866C]" /> */}
      </div>
    </section>
  );
};
