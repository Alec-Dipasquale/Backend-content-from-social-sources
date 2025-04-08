import express from 'express';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

const storage = new Storage();
const bucketName = "launcher-backend-98221.firebasestorage.app";
const bucket = storage.bucket(bucketName);
 // e.g. launcher-backend-98221.appspot.com

app.post('/generate-thumbnail', async (req, res) => {
  const { videoUrl, filename } = req.body;

  if (!videoUrl || !filename) {
    return res.status(400).send({ error: 'Missing videoUrl or filename' });
  }

  const tempVideo = `/tmp/${filename}.mp4`;
  const tempThumb = `/tmp/${filename}.jpg`;

  try {
    // Download video
    const response = await fetch(videoUrl);
    const buffer = await response.buffer();
    await fs.writeFile(tempVideo, buffer);

    // Generate thumbnail using ffmpeg (1s in)
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -y -i ${tempVideo} -ss 00:00:01 -vframes 1 ${tempThumb}`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Upload to Firebase Storage (or GCS)
    await bucket.upload(tempThumb, {
      destination: `thumbnails/${filename}.jpg`,
      public: true,
    });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/thumbnails/${filename}.jpg`;

    res.send({ thumbnailUrl: publicUrl });
  } catch (err) {
  console.error("❌ Thumbnail generation failed");
  console.error(err.stack || err.message || err);
  res.status(500).send({ error: 'Failed to generate thumbnail', details: err.message });
}

});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));
