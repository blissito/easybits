export const ItemList = ({ title }: { title: string }) => {
  return (
    <div className="flex gap-2 text-xl lg:text-2xl text-iron">
      <img alt="bullet" src="/bullet.svg" />
      <p className="font-cabin-regular font-light my-2">{title}</p>
    </div>
  );
};
