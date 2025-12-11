// server.js - Rideau Canal Dashboard backend

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { CosmosClient } = require("@azure/cosmos");

const app = express();
const port = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());

// Serve static frontend files from /public
app.use(express.static(path.join(__dirname, "public")));

// ---------- Cosmos DB client setup ----------
const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE_ID || "RideauCanalDB";
const containerId = process.env.COSMOS_CONTAINER_ID || "SensorAggregations";

if (!endpoint || !key) {
  console.error(
    "ERROR: Missing Cosmos DB credentials. Please set COSMOS_ENDPOINT and COSMOS_KEY in your .env file."
  );
  process.exit(1);
}

const cosmosClient = new CosmosClient({ endpoint, key });
const database = cosmosClient.database(databaseId);
const container = database.container(containerId);

// ---------- Health check ----------
app.get("/api/health", async (req, res) => {
  try {
    await database.read();
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Cosmos health check failed:", err.message);
    res.status(500).json({
      status: "error",
      message: "Cosmos DB is not reachable"
    });
  }
});

// ---------- /api/latest ----------
// Returns the most recent aggregated document per location.
app.get("/api/latest", async (req, res) => {
  try {
    // Get the most recent 100 docs ordered by windowEnd (descending)
    const querySpec = {
      query: "SELECT TOP 100 * FROM c ORDER BY c.windowEnd DESC"
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    // Keep only newest per location
    const latestByLocation = {};

    for (const doc of resources) {
      const loc = doc.location || "Unknown";

      if (!latestByLocation[loc]) {
        // First time we see this location (docs are already sorted by newest)
        latestByLocation[loc] = doc;
      }
    }

    const result = Object.values(latestByLocation);
    res.json(result);
  } catch (err) {
    console.error("Error in /api/latest:", err);
    res.status(500).json({ error: "Failed to fetch latest data" });
  }
});

// ---------- /api/history ----------
// Returns historical data for a time window.
// Query parameters:
//   - location (optional): filter by sensor location
//   - hours (optional): look back this many hours (default 6)
app.get("/api/history", async (req, res) => {
  const location = req.query.location || "";
  const hours = Number(req.query.hours) || 6;

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Build SQL query dynamically based on whether location is provided
  const baseQuery = `
    SELECT * FROM c
    WHERE c.windowEnd >= @since
    ${location ? "AND c.location = @location" : ""}
    ORDER BY c.windowEnd ASC
  `;

  const parameters = [{ name: "@since", value: since }];

  if (location) {
    parameters.push({ name: "@location", value: location });
  }

  const querySpec = {
    query: baseQuery,
    parameters
  };

  try {
    const { resources } = await container.items.query(querySpec).fetchAll();
    res.json(resources);
  } catch (err) {
    console.error("Error in /api/history:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ---------- Start server ----------
app.listen(port, () => {
  console.log(`Rideau Canal dashboard backend listening on port ${port}`);
});
