const API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "" // Same domain in Vercel
    : "";

export default API_BASE_URL;
