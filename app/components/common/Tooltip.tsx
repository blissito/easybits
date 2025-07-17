export const Tooltip = ({ tooltip }: { tooltip: string }) => {
  return (
    <div className="bg-black rounded-sm pt-2 box-border pb-4 w-[118px] h-fit px-2 text-white tooltip absolute -left-12 flex items-center justify-center -top-14">
      <span className="text-xs text-center"> {tooltip}</span>
    </div>
  );
};
