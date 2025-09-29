import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
// import pdfExportRouter from "./pdfExport.js";

const app = express();
const PORT = 3000;

// __dirname fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware to parse JSON and form-urlencoded
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Allow CORS (optional if serving frontend from same server)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// Proxy endpoint
app.post("/steamapi", async (req, res) => {
  try {
    const { mods_1 = [], mods_2 = [] } = req.body;

    const buildFormURI = (mods) =>
      mods.map((id, i) => `publishedfileids%5B${i}%5D=${id}`).join("&") + "&";

    const fetchSteamDetails = async (mods) => {
      const count = mods.length;
      const formURI = buildFormURI(mods);
      const url = `https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/?itemcount=${count}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `itemcount=${count}&${formURI}`,
      });

      return response.json();
    };

    const [processed_mods1, processed_mods2] = await Promise.all([
      fetchSteamDetails(mods_1),
      fetchSteamDetails(mods_2),
    ]);

    res.status(200).json({ processed_mods1, processed_mods2 });
  } catch (error) {
    console.error("Steam API error:", error);
    res.status(500).json({ error: "Failed to fetch mod details." });
  }
});

// Default route → index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
