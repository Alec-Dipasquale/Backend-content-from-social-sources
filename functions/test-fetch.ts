import admin from "firebase-admin";
import { readFileSync } from "fs";
import fetch from "node-fetch";

const runtimeConfig = JSON.parse(readFileSync(".runtimeconfig.json", "utf8"));

// This uses your Firebase CLI's credentials
admin.initializeApp({
  projectId: "launcher-backend-98221"
});
console.log("✅ Firebase Admin initialized");


const db = admin.firestore();

const subreddits = [
  "CrazyFuckingVideos",
  "nextfuckinglevel",
  "PublicFreakout",
  "unexpected",
  "interestingasfuck",
];

interface RedditApiResponse {
  data: {
    children: Array<{
      data: {
        title: string;
        url: string;
        thumbnail: string;
        permalink: string;
        created_utc: number;
        is_video: boolean;
        media?: {
          reddit_video?: {
            fallback_url?: string;
          };
        };
      };
    }>;
  };
}

async function runTest() {
  for (const subreddit of subreddits) {
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/top.json?t=day&limit=5`);
    const json = (await res.json()) as RedditApiResponse;

    const posts = json.data.children.map((post) => ({
      title: post.data.title,
      url: post.data.url,
      thumbnail: post.data.thumbnail,
      permalink: post.data.permalink,
      created: post.data.created_utc,
      is_video: post.data.is_video,
      video_url: post.data.media?.reddit_video?.fallback_url ?? null,
    }));

    const docRef = db.collection("redditFeed").doc(`TEST_${subreddit}`);
    const docSnap = await docRef.get();
    const existingPosts: any[] = docSnap.exists ? (docSnap.data()!.posts ?? []) : [];

    const existingPermalinks = new Set(existingPosts.map(p => p.permalink));
    const newUniquePosts = posts.filter(post => !existingPermalinks.has(post.permalink));

    if (newUniquePosts.length > 0) {
      const combinedPosts = [...newUniquePosts, ...existingPosts];

      await docRef.set({
        posts: combinedPosts,
        updatedAt: Date.now(),
      });

      console.log(`✅ TEST Added ${newUniquePosts.length} new posts to r/${subreddit}`);
    } else {
      console.log(`⚠️ TEST No new posts for r/${subreddit}`);
    }
  }
}

runTest().then(() => {
  console.log("🏁 Test run complete");
  process.exit(0);
}).catch(err => {
  console.error("❌ Test failed", err);
  process.exit(1);
});
