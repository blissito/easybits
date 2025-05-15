export const action = async ({ request }) => {
  console.log("Received");
  const body = await request.json();
  console.log("BOdy: ", body);

  // add delivery

  return null;
};
