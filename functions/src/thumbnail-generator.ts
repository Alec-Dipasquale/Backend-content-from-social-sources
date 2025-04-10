import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs/promises";
import * as fsCallback from "fs";
import * as path from "path";
import * as https from "https";
import * as crypto from "crypto";

export async function generateLocalThumbnail(
  videoUrl: string,
  videoId: string,
  tempDir: string = path.join(process.cwd(), "src", "__tests__", "thumbnails")
): Promise<string> {
  console.log("Working directory:", process.cwd());
  console.log("Thumbnail directory:", tempDir);

  // Create a hash of the videoId to get a safe filename
  const safeId = crypto.createHash("md5").update(videoId).digest("hex");

  // Create directory if it doesn't exist
  try {
    await fs.mkdir(tempDir, {recursive: true});
    console.log("✅ Thumbnail directory created or already exists");
  } catch (mkdirError) {
    console.error("❌ Error creating directory:", mkdirError);
    throw mkdirError;
  }

  const thumbnailPath = path.join(tempDir, `${safeId}.jpg`);
  const tempVideoPath = path.join(tempDir, `${safeId}.mp4`);

  try {
    // Download video to temp file
    console.log("📥 Downloading video...");
    console.log("Video will be saved temporarily to:", tempVideoPath);
    await downloadFile(videoUrl, tempVideoPath);

    // Generate thumbnail using ffmpeg
    console.log("🎨 Generating thumbnail with ffmpeg...");
    await new Promise((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .on("start", (commandLine) => {
          console.log(`🎬 ffmpeg command: ${commandLine}`);
        })
        .screenshots({
          timestamps: ["00:00:01"], // Take screenshot at 1 second
          filename: `${safeId}.jpg`,
          folder: tempDir,
          size: "640x?", // 640px width, maintain aspect ratio
        })
        .on("end", resolve)
        .on("error", (err) => {
          console.error("❌ ffmpeg error:", err);
          reject(err);
        });
    });
    console.log("✅ Thumbnail generated successfully.");

    // Clean up the temporary video file
    try {
      await fs.unlink(tempVideoPath);
      console.log("✅ Temporary video file cleaned up");
    } catch (unlinkError) {
      console.error("⚠️ Error cleaning up temporary video file:", unlinkError);
      // Continue execution even if cleanup fails
    }

    // Verify thumbnail exists
    try {
      await fs.access(thumbnailPath);
      console.log(`✅ Thumbnail file exists at: ${thumbnailPath}`);
      return thumbnailPath;
    } catch (error) {
      console.error(`❌ Thumbnail file not found at: ${thumbnailPath}`);
      throw new Error(`Thumbnail generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  } catch (error) {
    console.error("❌ Error generating thumbnail:", error);
    // Try to clean up any leftover files
    try {
      await fs.unlink(tempVideoPath).catch((err) => {
        console.error("⚠️ Error cleaning up temp video file:", err);
      });
      await fs.unlink(thumbnailPath).catch((err) => {
        console.error("⚠️ Error cleaning up thumbnail file:", err);
      });
    } catch (cleanupError) {
      console.error("⚠️ Error during cleanup:", cleanupError);
    }
    throw error;
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fsCallback.createWriteStream(dest);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Failed to download file: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve();
      });

      file.on("error", (err) => {
        file.close();
        fs.unlink(dest).catch((unlinkErr) => {
          console.error("⚠️ Error cleaning up failed download:", unlinkErr);
        });
        reject(err);
      });
    }).on("error", (err) => {
      file.close();
      fs.unlink(dest).catch((unlinkErr) => {
        console.error("⚠️ Error cleaning up after network error:", unlinkErr);
      });
      reject(err);
    });
  });
}
