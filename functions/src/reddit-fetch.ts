import * as https from "https";

export interface RedditPost {
  id: string;
  title: string;
  url: string;
  score: number;
  author: string;
  created: number;
  is_video: boolean;
  media?: {
    reddit_video?: {
      fallback_url: string;
    };
  };
  secure_media?: any;
  preview?: {
    images: Array<{
      source: {
        url: string;
      };
    }>;
  };
}

interface RedditResponse {
  data: {
    children: Array<{
      data: RedditPost;
    }>;
  };
}

export async function fetchRedditPosts(subreddit: string, limit: number): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/top.json?limit=${limit}&t=day`;

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LauncherBot/1.0)",
      },
    }, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP error! status: ${res.statusCode}`));
          return;
        }

        try {
          const response = JSON.parse(data) as RedditResponse;
          resolve(response.data.children.map((child) => child.data));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}
