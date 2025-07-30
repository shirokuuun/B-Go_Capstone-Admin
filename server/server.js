const express = require("express");
const app = express();
const cors = require("cors");
const corsOptions = {
  origin: "http://localhost:5173",
};

app.use(cors(corsOptions));

app.get("/api", (req, res) => {
  res.json({ fruits: ["Apple", "strawberry", "Cherry"] });
});

app.listen(3000, () => {
  console.log("Server is runndwaing on port 3000");
});
