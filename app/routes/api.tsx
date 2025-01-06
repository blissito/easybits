export const action = () => null;
export const loader = () => {
  return new Response(
    JSON.stringify({ message: "t(*_*t)", madeBy: "fixter.org" })
  );
};
