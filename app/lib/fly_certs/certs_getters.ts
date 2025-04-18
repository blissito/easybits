import { GraphQLClient } from "graphql-request";

const endpoint = "https://api.fly.io/graphql";
const APP_NAME = "easybits";

export async function createHost(hostname: string) {
  const query = `
mutation($appId: ID!, $hostname: String!) {
    addCertificate(appId: $appId, hostname: $hostname) {
        certificate {
            configured
            acmeDnsConfigured
            acmeAlpnConfigured
            certificateAuthority
            certificateRequestedAt
            dnsProvider
            dnsValidationInstructions
            dnsValidationHostname
            dnsValidationTarget
            hostname
            id
            source
        }
    }
}

                    `;
  const variables = { appId: APP_NAME, hostname };
  let result;
  try {
    result = await getClient().request(query, variables);
  } catch (e: unknown) {
    if (e instanceof Error) console.error(e.message);
  }
  return result;
}

export async function listHosts() {
  const query = `
                query($appName: String!) {
                app(name: $appName) {
                    certificates {
                    nodes {
                        createdAt
                        hostname
                        clientStatus
                    }
                    }
                }
                }
                  `;
  const variables = { appName: APP_NAME };
  return await getClient().request(query, variables);
}

export async function getFlyAppData() {
  const query = `
        query($appName: String!) {
            app(name: $appName) {
                    id
                    name
                }
            }`;
  const variables = { appName: APP_NAME };
  return await getClient().request(query, variables);
}

let FlyAPIClient: GraphQLClient;
const getClient = () => {
  FlyAPIClient ??= new GraphQLClient(endpoint, {
    headers: {
      authorization: "Bearer " + process.env.FLY_API_TOKEN,
    },
  });
  return FlyAPIClient;
};
