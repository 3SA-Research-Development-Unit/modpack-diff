import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
// import pdfExportRouter from "./pdfExport.js";

const app = express();
const PORT = 3000;

// __dirname fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

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

// Endpoint to parse modpack HTML files
app.post(
  "/parse-modpacks",
  upload.fields([{ name: "beforeFiles", maxCount: 1000 }, { name: "afterFiles", maxCount: 1000 }]),
  async (req, res) => {
    try {
      const beforeFiles = req.files?.beforeFiles || [];
      const afterFiles = req.files?.afterFiles || [];

      if (beforeFiles.length === 0 && afterFiles.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const aggregateMods = (files) => {
        const modsMap = new Map();

        // Common patterns in modpack HTMLs:
        // 1) <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=123...">Title</a>
        // 2) data-steamid="123" ...>Title</a>
        // 3) plain urls containing filedetails/?id=123

        const hrefRegex = /href=["']https?:\/\/steamcommunity\.com\/sharedfiles\/filedetails\/\?id=(\d+)["'][^>]*>([^<]*)<\/a>/gi;
        const dataSteamRegex = /data-steamid=["']?(\d+)["']?[^>]*>([^<]*)<\/a>/gi;
        const idOnlyRegex = /filedetails\/\?id=(\d+)/gi;

        files.forEach((file) => {
          const content = file.buffer.toString("utf-8");
          let match;

            // href with link text
            while ((match = hrefRegex.exec(content)) !== null) {
              const steamId = match[1];
              const modName = (match[2] || `Mod ${steamId}`).trim();
              if (!modsMap.has(steamId)) {
                modsMap.set(steamId, { steamId, name: modName });
                console.log(`Parsed mod from href -> id: ${steamId}, name: ${modName}`);
              }
            }

          // data-steamid attributes
          while ((match = dataSteamRegex.exec(content)) !== null) {
            const steamId = match[1];
            const modName = (match[2] || `Mod ${steamId}`).trim();
            if (!modsMap.has(steamId)) {
              modsMap.set(steamId, { steamId, name: modName });
              console.log(`Parsed mod from data-steamid -> id: ${steamId}, name: ${modName}`);
            }
          }

          // any remaining plain ids in URLs
          while ((match = idOnlyRegex.exec(content)) !== null) {
            const steamId = match[1];
            if (!modsMap.has(steamId)) {
              modsMap.set(steamId, { steamId, name: `Mod ${steamId}` });
              console.log(`Parsed mod from URL -> id: ${steamId}`);
            }
          }
        });

        return Array.from(modsMap.values());
      };

      const beforeMods = aggregateMods(beforeFiles);
      const afterMods = aggregateMods(afterFiles);

      const beforePackNames = beforeFiles.map(f => f.originalname || f.name || 'before');
      const afterPackNames = afterFiles.map(f => f.originalname || f.name || 'after');

      console.log(`Aggregate before mods count: ${beforeMods.length}`);
      console.log(beforeMods.map(m => m.steamId));
      console.log(`Aggregate after mods count: ${afterMods.length}`);
      console.log(afterMods.map(m => m.steamId));
      console.log('Before pack names:', beforePackNames);
      console.log('After pack names:', afterPackNames);

      res.status(200).json({
        beforeMods,
        afterMods,
        beforeCount: beforeMods.length,
        afterCount: afterMods.length,
        beforePackNames,
        afterPackNames,
      });
    } catch (error) {
      console.error("Parse error:", error);
      res.status(500).json({ error: "Failed to parse modpack files." });
    }
  }
);

// Endpoint to get mod details from Steam API
app.post("/get-mod-details", async (req, res) => {
  try {
    const { steamIds } = req.body;
    if (!steamIds || steamIds.length === 0) {
      return res.status(200).json({ mods: [] });
    }

    const buildFormURI = (ids) =>
      ids.map((id, i) => `publishedfileids%5B${i}%5D=${id}`).join("&") + "&";

    const fetchInChunks = async (ids) => {
      const chunkSize = 100;
      const chunks = [];
      for (let i = 0; i < ids.length; i += chunkSize) {
        chunks.push(ids.slice(i, i + chunkSize));
      }

      const allMods = [];
      for (const chunk of chunks) {
        const count = chunk.length;
        const formURI = buildFormURI(chunk);
        const url = `https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/?itemcount=${count}`;

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `itemcount=${count}&${formURI}`,
        });

        const data = await response.json();
        if (data.response?.publishedfiledetails) {
          allMods.push(...data.response.publishedfiledetails);
        }
      }
      return allMods;
    };

    const mods = await fetchInChunks(steamIds);
    res.status(200).json({ mods });
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
