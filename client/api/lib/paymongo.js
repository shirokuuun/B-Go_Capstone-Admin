export const createPayMongoCheckout = async (data) => {
  const response = await fetch(
    "https://api.paymongo.com/v1/checkout_sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          process.env.PAYMONGO_SECRET_KEY + ":"
        ).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    throw new Error(`PayMongo API error: ${response.status}`);
  }

  return await response.json();
};
