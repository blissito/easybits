


export * from '@stripe/ui-extension-sdk/version';
export const BUILD_TIME = '2025-06-06 12:54:13.186295 -0600 CST m=+4.340789793';


export default {
  "id": "com.example.easybits",
  "version": "0.0.1",
  "name": "EasyBits",
  "icon": "",
  "permissions": [
    {
      "permission": "customer_read",
      "purpose": "Receive access to the customer’s phone number?? and email??"
    },
    {
      "permission": "connected_account_read",
      "purpose": "to work with account id"
    }
  ],
  "connect_permissions": null,
  "allowed_redirect_uris": [
    "https://www.easybits.cloud/login/success"
  ],
  "stripe_api_access_type": "oauth",
  "distribution_type": "public"
};
