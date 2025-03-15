import { ProfileCard, SuscriptionCard } from "./profileComponents";

export default function Profile() {
  return (
    <article className=" min-h-screen w-full relative box-border inline-block md:py-10 py-6 px-4 md:px-[5%] lg:px-0">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl font-semibold">Perfil</h2>
        <ProfileCard />
        <SuscriptionCard />{" "}
      </div>
    </article>
  );
}
