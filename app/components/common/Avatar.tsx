export const Avatar = ({ img }: { img?: string }) => {
  return (
    <div className="w-10 h-10 border border-black bg-black  rounded-full relative ">
      <img
        className="w-10 h-10 border border-black object-cover rounded-full absolute -left-[1px] -top-[1px] "
        src={
          img
            ? img
            : "https://images.pexels.com/photos/1181533/pexels-photo-1181533.jpeg?auto=compress&cs=tinysrgb&w=1200"
        }
      />
    </div>
  );
};
