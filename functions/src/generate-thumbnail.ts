import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import ffmpeg, {FfprobeData} from "fluent-ffmpeg";
import fetch from "node-fetch";

interface ThumbnailData {
  videoUrl: string;
  videoId: string;
}

export interface ThumbnailResponse {
  thumbnailUrl: string;
}

// Constants for thumbnail generation
const SIZES = {
  LANDSCAPE: {targetWidth: 640, targetHeight: 360}, // 16:9
  PORTRAIT: {targetWidth: 360, targetHeight: 640}, // 9:16
  SQUARE: {targetWidth: 480, targetHeight: 480}, // 1:1
  WIDE: {targetWidth: 640, targetHeight: 480}, // 4:3
  TALL: {targetWidth: 480, targetHeight: 640}, // 3:4
};

function calculateTargetDimensions(width: number, height: number): { targetWidth: number, targetHeight: number } {
  const aspectRatio = width / height;

  if (aspectRatio > 16/9) return SIZES.LANDSCAPE;
  if (aspectRatio > 4/3) return SIZES.WIDE;
  if (aspectRatio > 3/4) return SIZES.SQUARE;
  if (aspectRatio > 9/16) return SIZES.TALL;
  return SIZES.PORTRAIT;
}

async function getVideoMetadata(videoPath: string): Promise<{width: number; height: number}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err: Error | null, metadata: FfprobeData) => {
      if (err) return reject(err);
      const stream = metadata.streams.find((s) => s.codec_type === "video");
      if (!stream || !stream.width || !stream.height) {
        return reject(new Error("No valid video stream found"));
      }
      resolve({
        width: stream.width,
        height: stream.height,
      });
    });
  });
}

// Internal function that can be called directly
export async function generateThumbnailInternal(videoUrl: string, videoId: string): Promise<string> {
  const tempDir = os.tmpdir();
  const videoPath = path.join(tempDir, `${videoId}.mp4`);
  const thumbnailPath = path.join(tempDir, `${videoId}.jpg`);

  try {
    // Download video
    const response = await fetch(videoUrl);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(videoPath, Buffer.from(buffer));

    // Get video metadata to determine dimensions
    const metadata = await getVideoMetadata(videoPath);
    const {targetWidth, targetHeight} = calculateTargetDimensions(metadata.width, metadata.height);

    // Generate thumbnail using FFmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ["50%"],
          filename: `${videoId}.jpg`,
          folder: tempDir,
          size: `${targetWidth}x${targetHeight}`,
        })
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });

    // Upload to Firebase Storage with public access
    const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
    const destination = `thumbnails/${videoId}.jpg`;
    await bucket.upload(thumbnailPath, {
      destination,
      metadata: {
        contentType: "image/jpeg",
        metadata: {
          width: targetWidth.toString(),
          height: targetHeight.toString(),
          originalWidth: metadata.width.toString(),
          originalHeight: metadata.height.toString(),
        },
        cacheControl: "public, max-age=31536000", // Cache for 1 year
      },
      public: true, // Make the file publicly accessible
    });

    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${process.env.FIREBASE_STORAGE_BUCKET}/${destination}`;
    return publicUrl;
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
    } catch (error) {
      console.error("Error cleaning up temporary files:", error);
    }
  }
}

// Export the Cloud Function wrapper
export const generateThumbnail = onCall<ThumbnailData, Promise<ThumbnailResponse>>(
  async (request) => {
    const {videoUrl, videoId} = request.data;

    if (!videoUrl || !videoId) {
      throw new Error("Missing required parameters");
    }

    try {
      const thumbnailUrl = await generateThumbnailInternal(videoUrl, videoId);
      return {thumbnailUrl};
    } catch (error) {
      console.error("Error generating thumbnail:", error);
      throw new Error("Failed to generate thumbnail");
    }
  }
);
