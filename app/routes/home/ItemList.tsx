export const ItemList = ({ title }: { title: string }) => {
  return (
    <div className="flex gap-2 text-xl lg:text-2xl text-iron">
      {/* Tamaño fijo: sin él, la flecha se estira a la altura del texto y en
          un item de dos renglones sale el doble de grande que en el de al lado. */}
      <img alt="bullet" src="/home/bulletHome.svg" className="w-5 lg:w-6 h-auto shrink-0 self-start mt-3 lg:mt-3.5" />
      <p className="font-cabin-regular font-light my-2">{title}</p>
    </div>
  );
};
