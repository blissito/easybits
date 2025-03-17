const DEFAULT_PIC =
  "https://images.pexels.com/photos/1181533/pexels-photo-1181533.jpeg?auto=compress&cs=tinysrgb&w=1200";
export const Avatar = ({ src }: { src?: string }) => {
  return (
    <div className="w-10 h-10 border border-black bg-black  rounded-full relative ">
      <img
        onError={({ currentTarget }) => {
          currentTarget.onerror = null;
          currentTarget.src = DEFAULT_PIC;
        }}
        className="w-10 h-10 border border-black object-cover rounded-full absolute -left-[1px] -top-[1px] "
        src={src ? src : DEFAULT_PIC}
      />
    </div>
  );
};
