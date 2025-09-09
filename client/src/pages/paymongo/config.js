// PayMongo Client Configuration
export const PAYMONGO_CONFIG = {
  publicKey: import.meta.env.PAYMONGO_PUBLIC_KEY || "pk_test_your_public_key",
  secretKey: import.meta.env.PAYMONGO_SECRET_KEY || "sk_test_your_secret_key",
  apiUrl: "https://api.paymongo.com/v1",
  webhookUrl: "/api/webhooks/paymongo",
};

export default PAYMONGO_CONFIG;
