import fetch from "node-fetch";

interface RedditPost {
  data: {
    title: string;
    url: string;
    permalink: string;
    created_utc: number;
    is_video: boolean;
    media?: {
      reddit_video?: {
        hls_url: string;
      };
    };
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
    thumbnail: string;
  };
}

interface RedditResponse {
  data: {
    children: RedditPost[];
  };
}

interface ProcessedPost {
  title: string;
  url: string;
  thumbnail: string;
  permalink: string;
  created: number;
  is_video: boolean;
  video_url: string | null;
  preview_data: {
    has_preview: boolean;
    preview_sizes: string[];
    source_size: string;
  };
}

async function testRedditFetch() {
  const subreddit = "CrazyFuckingVideos"; // We'll test with one subreddit first
  console.log(`Testing fetch from r/${subreddit}...\n`);

  try {
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/top.json?t=day&limit=5`);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const json = await res.json() as RedditResponse;

    const posts = json.data.children.map((post: RedditPost): ProcessedPost => {
      const redditVideo = post.data.media?.reddit_video;
      const previewImage = post.data.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, "&") ||
                         post.data.preview?.images?.[0]?.resolutions?.slice(-1)[0]?.url?.replace(/&amp;/g, "&") ||
                         post.data.thumbnail;
      const hlsUrl = redditVideo?.hls_url ?? null;

      return {
        title: post.data.title,
        url: post.data.url,
        thumbnail: previewImage,
        permalink: post.data.permalink,
        created: post.data.created_utc,
        is_video: post.data.is_video,
        video_url: hlsUrl,
        // Add some debug info
        preview_data: {
          has_preview: !!post.data.preview,
          preview_sizes: post.data.preview?.images?.[0]?.resolutions?.map((r) => `${r.width}x${r.height}`) || [],
          source_size: post.data.preview?.images?.[0]?.source ?
            `${post.data.preview.images[0].source.width}x${post.data.preview.images[0].source.height}` : "N/A",
        },
      };
    });

    // Print the results in a readable format
    posts.forEach((post: ProcessedPost, index: number) => {
      console.log(`Post ${index + 1}:`);
      console.log(`Title: ${post.title}`);
      console.log(`Is Video: ${post.is_video}`);
      console.log(`Video URL: ${post.video_url || "N/A"}`);
      console.log(`Thumbnail URL: ${post.thumbnail}`);
      console.log("Preview Info:", post.preview_data);
      console.log("----------------------------------------\n");
    });
  } catch (err) {
    console.error("❌ Test failed:", err);
  }
}

// Run the test
testRedditFetch();
