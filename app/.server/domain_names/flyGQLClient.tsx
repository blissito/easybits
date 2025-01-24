import { request, GraphQLClient } from "graphql-request";

const argv = require("yargs").demandOption(["id"]).alias("i", "id").argv;

async function main() {
  const endpoint = "https://api.fly.io/graphql";

  const FlyAPIClient = new GraphQLClient(endpoint, {
    headers: {
      authorization: "Bearer " + process.env.FLY_API_TOKEN,
    },
  });

  const query = `
        query($appId: String!) {
            app(id: $appId) {
                    id
                    name
                }
            }`;

  const variables = { appId: argv.id };

  const data = await FlyAPIClient.request(query, variables);
  console.log(JSON.stringify(data, undefined, 2));
}

main().catch((error) => console.error(error));
