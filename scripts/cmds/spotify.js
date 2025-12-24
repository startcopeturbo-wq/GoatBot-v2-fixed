const axios = require("axios");
const fs = require("fs");
const path = require("path");

module.exports = {
  config: {
    name: "spotify",
    version: "1.0.0",
    author: "April Manalo",
    role: 0,
    category: "music",
    guide: "spotify <song name>"
  },

  onStart: async function ({ api, event, args }) {
    const query = args.join(" ").trim();
    if (!query) {
      return api.sendMessage(
        "⚠️ Usage: spotify <song name>",
        event.threadID,
        event.messageID
      );
    }

    let searchMsg;
    try {
      searchMsg = await api.sendMessage(
        "🔎 Searching Spotify...",
        event.threadID
      );

      const res = await axios.get(
        "https://norch-project.gleeze.com/api/spotify",
        { params: { q: query } }
      );

      const results = Array.isArray(res.data?.results)
        ? res.data.results.slice(0, 5)
        : [];

      if (results.length === 0) {
        return api.editMessage(
          "❌ No results found.",
          searchMsg.messageID
        );
      }

      let msg = "🎧 Spotify Results:\n\n";
      results.forEach((s, i) => {
        msg += `${i + 1}. ${s.title}\n👤 ${s.artist}\n⏱ ${s.duration}\n\n`;
      });
      msg += "👉 Reply with number (1–5)";

      await api.editMessage(msg, searchMsg.messageID);

      // ✅ SAFE handleReply init
      if (!global.client.handleReply) global.client.handleReply = [];

      global.client.handleReply.push({
        name: module.exports.config.name,
        messageID: searchMsg.messageID,
        author: event.senderID,
        type: "spotify_select",
        songs: results
      });

    } catch (err) {
      console.error("[SPOTIFY SEARCH ERROR]", err);
      if (searchMsg?.messageID) {
        api.editMessage(
          "❌ Error while searching.",
          searchMsg.messageID
        );
      }
    }
  },

  onReply: async function ({ api, event, handleReply }) {
    if (handleReply.type !== "spotify_select") return;
    if (event.senderID !== handleReply.author) return;

    const choice = parseInt(event.body);
    if (isNaN(choice) || choice < 1 || choice > handleReply.songs.length) {
      return api.sendMessage(
        "❌ Invalid choice. Reply with number 1–5.",
        event.threadID,
        event.messageID
      );
    }

    const song = handleReply.songs[choice - 1];

    try {
      // 🧹 remove choices message
      api.unsendMessage(handleReply.messageID);

      const downloadingMsg = await api.sendMessage(
        `⏳ Downloading:\n🎵 ${song.title}\n👤 ${song.artist}`,
        event.threadID
      );

      // 🔽 DOWNLOAD API
      const dlRes = await axios.get(
        "https://norch-project.gleeze.com/api/spotify-dl-v2",
        { params: { url: song.spotify_url } }
      );

      const track = dlRes.data?.trackData?.[0];
      if (!track?.download_url) {
        return api.editMessage(
          "❌ Failed to download song.",
          downloadingMsg.messageID
        );
      }

      // 📁 paths
      const cacheDir = path.join(__dirname, "cache");
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

      const mp3Path = path.join(cacheDir, `${Date.now()}.mp3`);
      const coverPath = path.join(cacheDir, `${Date.now()}.jpg`);

      // 🎵 download mp3
      const mp3 = await axios.get(track.download_url, { responseType: "arraybuffer" });
      fs.writeFileSync(mp3Path, Buffer.from(mp3.data));

      // 🖼️ download cover
      const cover = await axios.get(track.image, { responseType: "arraybuffer" });
      fs.writeFileSync(coverPath, Buffer.from(cover.data));

      // 📸 send cover + info
      await api.sendMessage(
        {
          body:
            `🎵 ${track.name}\n` +
            `👤 ${track.artists}\n` +
            `⏱ ${track.duration}`,
          attachment: fs.createReadStream(coverPath)
        },
        event.threadID
      );

      // 🎙️ send mp3 as VOICE MESSAGE
      await api.sendMessage(
        {
          body: "",
          attachment: fs.createReadStream(mp3Path)
        },
        event.threadID
      );

      api.unsendMessage(downloadingMsg.messageID);

      // 🧹 cleanup
      fs.unlinkSync(mp3Path);
      fs.unlinkSync(coverPath);

      // 🧹 remove handleReply
      global.client.handleReply =
        global.client.handleReply.filter(
          h => h.messageID !== handleReply.messageID
        );

    } catch (err) {
      console.error("[SPOTIFY DOWNLOAD ERROR]", err);
      api.sendMessage(
        "❌ Error while downloading song.",
        event.threadID,
        event.messageID
      );
    }
  }
};
