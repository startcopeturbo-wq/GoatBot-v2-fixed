const axios = require("axios");
const fs = require("fs");
const path = require("path");

module.exports = {
  config: {
    name: "spotify",
    version: "1.0.1",
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

    let msg;
    try {
      msg = await api.sendMessage("🔎 Searching Spotify...", event.threadID);

      const res = await axios.get(
        "https://norch-project.gleeze.com/api/spotify",
        { params: { q: query } }
      );

      const songs = res.data?.results?.slice(0, 5);
      if (!songs || songs.length === 0) {
        return api.editMessage("❌ No results found.", msg.messageID);
      }

      let text = "🎧 Spotify Results:\n\n";
      songs.forEach((s, i) => {
        text += `${i + 1}. ${s.title}\n👤 ${s.artist}\n⏱ ${s.duration}\n\n`;
      });
      text += "👉 Reply with number (1–5)";

      await api.editMessage(text, msg.messageID);

      global.client.handleReply.push({
        type: "spotify",
        name: this.config.name, // ⭐ CRITICAL
        author: event.senderID,
        messageID: msg.messageID,
        songs
      });

    } catch (e) {
      console.error("[SPOTIFY SEARCH]", e);
      if (msg?.messageID)
        api.editMessage("❌ Search failed.", msg.messageID);
    }
  },

  onReply: async function ({ api, event, handleReply }) {
    if (handleReply.type !== "spotify") return;
    if (event.senderID !== handleReply.author) return;

    const index = parseInt(event.body);
    if (isNaN(index) || index < 1 || index > handleReply.songs.length) {
      return api.sendMessage(
        "❌ Invalid choice. Reply 1–5 only.",
        event.threadID,
        event.messageID
      );
    }

    const song = handleReply.songs[index - 1];

    try {
      // ✅ REMOVE CHOICES
      api.unsendMessage(handleReply.messageID);

      const loading = await api.sendMessage(
        `⏳ Downloading:\n🎵 ${song.title}\n👤 ${song.artist}`,
        event.threadID
      );

      const dl = await axios.get(
        "https://norch-project.gleeze.com/api/spotify-dl-v2",
        { params: { url: song.spotify_url } }
      );

      const track = dl.data?.trackData?.[0];
      if (!track?.download_url) {
        return api.editMessage("❌ Download failed.", loading.messageID);
      }

      const cache = path.join(__dirname, "cache");
      if (!fs.existsSync(cache)) fs.mkdirSync(cache, { recursive: true });

      const mp3 = path.join(cache, `${Date.now()}.mp3`);
      const cover = path.join(cache, `${Date.now()}.jpg`);

      const mp3Buf = await axios.get(track.download_url, { responseType: "arraybuffer" });
      fs.writeFileSync(mp3, Buffer.from(mp3Buf.data));

      const imgBuf = await axios.get(track.image, { responseType: "arraybuffer" });
      fs.writeFileSync(cover, Buffer.from(imgBuf.data));

      await api.sendMessage(
        {
          body: `🎵 ${track.name}\n👤 ${track.artists}`,
          attachment: fs.createReadStream(cover)
        },
        event.threadID
      );

      await api.sendMessage(
        {
          attachment: fs.createReadStream(mp3)
        },
        event.threadID
      );

      api.unsendMessage(loading.messageID);

      fs.unlinkSync(mp3);
      fs.unlinkSync(cover);

      // 🧹 CLEAN HANDLE
      global.client.handleReply =
        global.client.handleReply.filter(h => h.messageID !== handleReply.messageID);

    } catch (err) {
      console.error("[SPOTIFY DL]", err);
      api.sendMessage("❌ Error downloading.", event.threadID);
    }
  }
};
