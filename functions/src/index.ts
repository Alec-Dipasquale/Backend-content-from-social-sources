import * as admin from "firebase-admin";
import {onSchedule} from "firebase-functions/v2/scheduler";
// import {generateThumbnailInternal} from "./generate-thumbnail"; // Removed unused import
// import {validateImageUrl} from "./image-utils"; // Removed unused import
import fetch, {RequestInit} from "node-fetch";
import {generateLocalThumbnail} from "./thumbnail-generator";
import * as fs from "fs";
import {promisify} from "util";
import * as os from "os";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

// Initialize Storage bucket
const bucket = admin.storage().bucket();

// Promisify fs functions
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);

// Constants for processing
const MAX_RETRIES = 3;
const BATCH_SIZE = 50; // Increased from 3 to 50
const MEMORY_LIMIT = 200 * 1024 * 1024; // 200MB threshold

const subreddits = [
  "CrazyFuckingVideos",
  "nextfuckinglevel",
  "PublicFreakout",
  "unexpected",
  "interestingasfuck",
  // Added more video subreddits:
  "videos",
  "AbruptChaos",
  "IdiotsInCars",
  "Whatcouldgowrong",
  "BeAmazed",
  "toptalent",
  "WinStupidPrizes",
  "holdmybeer",
];

interface RedditPost {
  kind: string;
  data: {
    title: string;
    url: string;
    permalink: string;
    created_utc: number;
    is_video: boolean;
    subreddit: string;
    thumbnail: string;
    over_18: boolean;
    score: number;
    num_comments: number;
    author: string;
    upvote_ratio: number;
    preview?: {
      images: Array<{
        source: {
          url: string;
          width: number;
          height: number;
        };
        resolutions: Array<{
          url: string;
          width: number;
          height: number;
        }>;
      }>;
      enabled?: boolean;
    };
    media?: {
      type?: string;
      reddit_video?: {
        fallback_url: string;
        hls_url: string;
        height: number;
        width: number;
        dash_url: string;
        duration: number;
        bitrate_kbps: number;
        is_gif: boolean;
      };
    };
  };
}

interface RedditResponse {
  kind: string;
  data: {
    children: RedditPost[];
    after: string | null;
    before: string | null;
  };
}

// Helper function to check memory usage
function checkMemoryUsage(): void {
  const used = process.memoryUsage().heapUsed;
  if (used > MEMORY_LIMIT) {
    throw new Error(`Memory usage too high (${Math.round(used / 1024 / 1024)}MB)`);
  }
}

// Helper function to process a single subreddit
async function processSubreddit(subreddit: string, db: admin.firestore.Firestore): Promise<void> {
  try {
    console.log(`📥 Fetching posts from r/${subreddit}...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(
      `https://www.reddit.com/r/${subreddit}/top.json?limit=${BATCH_SIZE}&t=day`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LauncherBot/1.0)",
        },
        signal: controller.signal as RequestInit["signal"],
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as RedditResponse;
    const posts = data.data.children;
    console.log(`📊 Found ${posts.length} posts in r/${subreddit}`);

    // Filter out posts from the last 24 hours
    const twentyFourHoursAgo = Date.now() / 1000 - (3600 * 24);
    const recentPosts = posts.filter((post) => post.data.created_utc > twentyFourHoursAgo);
    console.log(`📊 Found ${recentPosts.length} recent posts in r/${subreddit}`);

    // Process each post
    for (const post of recentPosts) {
      try {
        checkMemoryUsage(); // Check memory before processing each post

        const postData = post.data;

        // Check if it's a native Reddit video
        const isRedditVideo = postData.is_video && postData.media?.reddit_video?.fallback_url;

        let finalThumbnailUrl = null;
        let videoUrl = null;

        if (isRedditVideo && postData.media?.reddit_video?.fallback_url) {
          // Use fallback URL for thumbnail generation
          const thumbnailVideoUrl = postData.media.reddit_video.fallback_url;
          videoUrl = postData.media.reddit_video.dash_url || postData.media.reddit_video.fallback_url;
          const isGif = postData.media.reddit_video.is_gif || false;

          console.log(`🎥 Reddit video detected - ${isGif ? "GIF type" : "Regular video"}`);

          try {
            console.log(`🔄 Starting thumbnail generation for Reddit video: ${thumbnailVideoUrl}`);

            // Create a temporary directory for this run
            const tempDir = path.join(os.tmpdir(), "reddit-thumbnails");
            await mkdir(tempDir, {recursive: true}).catch((err) => console.log("Directory exists:", err));

            // Generate thumbnail
            const thumbnailPath = await generateLocalThumbnail(thumbnailVideoUrl, postData.permalink, tempDir);
            console.log(`✅ Thumbnail generated at path: ${thumbnailPath}`);

            // Upload to Firebase Storage
            const uploadPath = `thumbnails/${Date.now()}_${path.basename(thumbnailPath)}`;
            await bucket.upload(thumbnailPath, {
              destination: uploadPath,
              metadata: {
                contentType: "image/jpeg",
                cacheControl: "public, max-age=31536000", // Cache for 1 year
              },
              public: true,
              predefinedAcl: "publicRead",
            });

            // Use direct public URL instead of signed URL
            finalThumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${uploadPath}`;
            console.log(`✅ Thumbnail uploaded to Storage: ${finalThumbnailUrl}`);

            // Clean up temp file
            await unlink(thumbnailPath).catch((err) => console.log("Cleanup error:", err));
          } catch (error) {
            console.error("❌ Failed to generate/upload Reddit video thumbnail:", error);
            console.log("⏭️ Skipping post due to thumbnail generation failure");
            continue;
          }
        } else {
          // Skip if not a Reddit video
          console.log(`⏭️ Skipping non-video post or unsupported video type: ${postData.title}`);
          continue;
        }

        // Skip if we don't have a thumbnail
        if (!finalThumbnailUrl) {
          console.log(`⏭️ Skipping post due to missing thumbnail: ${postData.title}`);
          continue;
        }

        const docId = postData.permalink.replace(/[^\w]/g, "_");

        // Firestore Check
        const docRef = db.collection("redditVideos").doc(docId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          console.log(`⏭️ Skipping already processed post: ${postData.title} (${docId})`);
          continue;
        }

        console.log(`💾 Preparing to save video post: ${postData.title} (${docId})`);

        try {
          // Prepare document data, ensuring no undefined values
          const docData = {
            title: postData.title,
            url: postData.url,
            thumbnail: finalThumbnailUrl,
            permalink: postData.permalink,
            created: postData.created_utc,
            is_video: Boolean(postData.is_video),
            video_url: videoUrl,
            video_source: "reddit",
            video_height: postData.media?.reddit_video?.height || null,
            video_width: postData.media?.reddit_video?.width || null,
            duration: postData.media?.reddit_video?.duration || null,
            bitrate: postData.media?.reddit_video?.bitrate_kbps || null,
            is_gif: postData.media?.reddit_video?.is_gif || false,
            has_audio: Boolean(postData.media?.reddit_video?.dash_url && !postData.media?.reddit_video?.is_gif),
            subreddit: postData.subreddit,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            nsfw: Boolean(postData.over_18),
            score: postData.score || 0,
            comments: postData.num_comments || 0,
            author: postData.author || "[deleted]",
            upvoteRatio: postData.upvote_ratio || 1.0,
            has_media: Boolean(postData.media),
            media_type: postData.media?.type || null,
            postId: docId,
          };

          // Save to Firestore
          await docRef.set(docData, {merge: true});

          console.log(`✅ Successfully saved Reddit video post to Firestore: ${postData.title}`);
        } catch (saveError) {
          console.error("❌ Failed to save post to Firestore:", {
            error: saveError,
            postId: docId,
            title: postData.title,
            errorMessage: saveError instanceof Error ? saveError.message : "Unknown error",
            errorStack: saveError instanceof Error ? saveError.stack : undefined,
          });
          throw saveError;
        }

        // Force garbage collection between posts
        if (global.gc) {
          global.gc();
        }

        // Add a small delay between posts
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        if (error instanceof Error && error.message.includes("Memory usage too high")) {
          throw error; // Re-throw memory errors to stop processing
        }
        console.error("Error in outer post processing loop:", error);
        // Don't re-throw here, allow loop to continue
      }
    }

    console.log(`✅ Successfully processed r/${subreddit}`);
  } catch (error) {
    console.error(`❌ Error processing r/${subreddit}:`, error);
    throw error; // Re-throw to handle in the main function
  }
}

// Main scheduled function to fetch Reddit feed
export const fetchRedditFeed = onSchedule({
  schedule: "every 6 hours", // Changed from every 60 minutes
  retryCount: MAX_RETRIES,
  timeoutSeconds: 540, // 9 minutes
  memory: "512MiB", // Increase memory allocation
}, async () => {
  const db = admin.firestore();
  let processedCount = 0;
  let errorCount = 0;

  // Process one subreddit at a time
  for (const subreddit of subreddits) {
    try {
      checkMemoryUsage();
      await processSubreddit(subreddit, db);
      processedCount++;

      // Force garbage collection between subreddits
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      errorCount++;
      console.error(`❌ Error processing r/${subreddit}:`, error);
      if (error instanceof Error && error.message.includes("Memory usage too high")) {
        break; // Stop processing if we hit memory limits
      }
    }
    // Add a larger delay between subreddits
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`🏁 Finished processing: ${processedCount} successful, ${errorCount} failed`);

  // Write stats to Firestore
  await db.collection("stats").doc("fetchRedditFeed").set({
    processedCount,
    errorCount,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
});
