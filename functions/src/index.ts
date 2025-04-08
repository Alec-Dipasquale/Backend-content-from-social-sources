import * as admin from "firebase-admin";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {generateThumbnailInternal} from "./generate-thumbnail";
import {validateImageUrl} from "./image-utils";
import fetch from "node-fetch";

// Initialize Firebase Admin
admin.initializeApp();

// Constants for processing
const MAX_RETRIES = 3;
const BATCH_SIZE = 3; // Reduced from 5 to 3 to manage memory better
const MEMORY_LIMIT = 200 * 1024 * 1024; // 200MB threshold (to stay under 256MB limit)

const subreddits = [
  "CrazyFuckingVideos",
  "nextfuckinglevel",
  "PublicFreakout",
  "unexpected",
  "interestingasfuck",
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
    };
    media?: {
      type?: string;
      reddit_video?: {
        fallback_url: string;
        hls_url: string;
        height: number;
        width: number;
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

// Helper function to validate video URL
function isValidVideoUrl(url: string | undefined): url is string {
  return typeof url === "string" && url.length > 0 && (
    url.endsWith(".mp4") ||
    url.includes("v.redd.it") ||
    url.includes("reddit.com/video")
  );
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
        signal: controller.signal,
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
        if (!postData.is_video) {
          console.log(`⏭️ Skipping non-video post: ${postData.title}`);
          continue;
        }

        const videoUrl = postData.media?.reddit_video?.fallback_url;
        if (!isValidVideoUrl(videoUrl)) {
          console.log(`⏭️ Skipping post with invalid video URL: ${postData.title}`);
          continue;
        }

        const docId = postData.permalink.replace(/[^\w]/g, "_");
        console.log(`🎥 Processing video post: ${postData.title} (${docId})`);

        try {
          // Try to generate thumbnail from video
          console.log(`🎬 Generating thumbnail for: ${postData.title}`);
          const thumbnailUrl = await generateThumbnailInternal(videoUrl, docId);
          console.log(`✅ Generated thumbnail URL: ${thumbnailUrl}`);

          // Save to Firestore
          console.log(`💾 Saving to Firestore: ${docId}`);
          const docRef = db.collection("redditVideos").doc(docId);
          await docRef.set({
            title: postData.title,
            url: postData.url,
            thumbnail: thumbnailUrl,
            permalink: postData.permalink,
            created: postData.created_utc,
            is_video: postData.is_video,
            video_url: postData.media?.reddit_video?.hls_url || videoUrl,
            subreddit: postData.subreddit,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, {merge: true});

          // Verify the document was saved
          const savedDoc = await docRef.get();
          if (!savedDoc.exists) {
            throw new Error("Document was not saved successfully");
          }

          console.log(`✅ Successfully saved post: ${postData.title}`);
        } catch (error) {
          console.error(`❌ Failed to process ${postData.title}:`, error);
          // Log additional details for debugging
          console.error("Post details:", {
            title: postData.title,
            videoUrl,
            is_video: postData.is_video,
            has_media: Boolean(postData.media),
            media_type: postData.media?.type,
            docId,
          });
          throw error; // Re-throw to track in error count
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
        console.error("Error processing post:", error);
        throw error; // Re-throw to track in error count
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
  schedule: "every 60 minutes",
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

// Thumbnail generation function for posts that need it
export const scheduledFunction = onSchedule({
  schedule: "every 5 minutes",
  retryCount: MAX_RETRIES,
  timeoutSeconds: 540, // 9 minutes
}, async () => {
  const db = admin.firestore();
  const postsRef = db.collection("posts");

  try {
    const snapshot = await postsRef
      .where("thumbnailUrl", "==", null)
      .limit(10)
      .get();

    if (snapshot.empty) {
      console.log("No posts found needing thumbnails");
      return;
    }

    for (const doc of snapshot.docs) {
      const post = doc.data();

      try {
        // Try to generate thumbnail from video
        const thumbnailUrl = await generateThumbnailInternal(post.url, doc.id);

        await doc.ref.update({
          thumbnailUrl,
          thumbnailError: null,
        });

        console.log(`Generated thumbnail for post ${doc.id}`);
      } catch (error: unknown) {
        console.error(`Error generating thumbnail for post ${doc.id}:`, error);

        // If thumbnail generation fails, try to validate and use the preview image
        if (post.previewUrl) {
          try {
            const isValid = await validateImageUrl(post.previewUrl);
            if (isValid) {
              await doc.ref.update({
                thumbnailUrl: post.previewUrl,
                thumbnailError: null,
              });
              console.log(`Using preview image for post ${doc.id}`);
              continue;
            }
          } catch (validationError) {
            console.error(`Error validating preview image for post ${doc.id}:`, validationError);
          }
        }

        // If all attempts fail, mark the error
        await doc.ref.update({
          thumbnailError: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  } catch (error: unknown) {
    console.error("Error in scheduled function:", error);
    throw error;
  }
});
