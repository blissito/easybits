import { GraphQLClient } from "graphql-request";

const endpoint = "https://api.fly.io/graphql";
const APP_NAME = "easybits";

export async function removeHost(hostname: string) {
  const query = `
     mutation($appId: ID!, $hostname: String!) {
        deleteCertificate(appId: $appId, hostname: $hostname) {
            app {
                name
            }
            certificate {
                hostname
                id
            }
        }
    }
  `;
  const variables = { appId: APP_NAME, hostname };
  let result;
  try {
    result = await getClient().request(query, variables);
    console.info("::CERT_DELETEION_SUCCESS::", hostname);
  } catch (e: unknown) {
    if (e instanceof Error)
      console.error("::ERROR_ON_CERT_DELETION::", e.message);
  }
  return result;
}

export async function showHost(hostname: string) {
  const query = `
          query($appId: String!, $hostname: String!) {
          app(name: $appId) {
            certificate(hostname: $hostname) {
              configured
              acmeDnsConfigured
              acmeAlpnConfigured
              certificateAuthority
              createdAt
              dnsProvider
              dnsValidationInstructions
              dnsValidationHostname
              dnsValidationTarget
              hostname
              id
              source
              clientStatus
              issued {
                nodes {
                  type
                  expiresAt
                }
              }
            }
          }
        }
  `;
  const variables = { appId: APP_NAME, hostname };
  let result;
  try {
    result = await getClient().request(query, variables);
  } catch (e: unknown) {
    if (e instanceof Error)
      console.error("::ERROR_ON_CERT_CREATION::", e.message);
  }
  return result;
}

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
            clientStatus
        }
    }
}

                    `;
  const variables = { appId: APP_NAME, hostname };
  let result;
  try {
    result = await getClient().request(query, variables);
    console.info("::CERT_CREATION_SUCCESS::", hostname);
  } catch (e: unknown) {
    if (e instanceof Error)
      console.error("::ERROR_ON_CERT_CREATION::", e.message);
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
