
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "UnaTech Studio API is running!",
    application: "UnaTech Studio",
    version: "1.0.0",
  });
});

// Root API route
app.get("/api", (req, res) => {
  res.json({
    message: "Welcome to UnaTech Studio API",
    status: "online",
  });
});

// Handle unknown API routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`UnaTech Studio server running at http://localhost:${PORT}`);
});
