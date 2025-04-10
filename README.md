# Reddit Video Thumbnail Generator

A Firebase Cloud Function service that automatically fetches Reddit videos and generates high-quality thumbnails. Built with TypeScript and FFmpeg, this service processes Reddit videos and stores them in Firebase Storage with optimized thumbnails.

## Features

- 🎥 Automatic Reddit video processing
- 🖼️ High-quality thumbnail generation
- 🎯 Support for Reddit's DASH video format
- 🔄 Scheduled post fetching from multiple subreddits (runs every 6 hours)
- ☁️ Firebase Storage integration with public URLs
- 📊 Comprehensive metadata storage in Firestore
- 🛡️ Advanced error handling and recovery
- 🔍 Memory usage monitoring
- 🔄 Configurable batch processing
- 🧹 Automatic cleanup of temporary files

## Tech Stack

- TypeScript
- Firebase Cloud Functions (v2)
- FFmpeg for video processing
- Firebase Admin SDK
- Firebase Storage
- Firestore

## Prerequisites

- Node.js 18 or later
- Firebase CLI
- FFmpeg installed on your system

## Environment Setup

1. Create a `.env` file in the root directory with the following variables:
```bash
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=${FIREBASE_PROJECT_ID}.firebasestorage.app

# Function Configuration
NODE_ENV=production
FUNCTION_REGION=us-central1
FUNCTION_MEMORY=256MB
FUNCTION_TIMEOUT=60s
```

2. Update your Firebase Storage rules in `storage.rules`:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;  // Public read access
      allow write: if false; // No public write access
    }
  }
}
```

## Getting Started

1. Clone the repository
2. Install dependencies:
```bash
cd functions
npm install
```

3. Set up your Firebase project:
```bash
firebase init
```

4. Deploy the functions:
```bash
npm run deploy
```

## Configuration

The function is configured to process videos from the following subreddits:
- CrazyFuckingVideos
- nextfuckinglevel
- PublicFreakout
- unexpected
- interestingasfuck
- videos
- AbruptChaos
- IdiotsInCars
- Whatcouldgowrong
- BeAmazed
- toptalent
- WinStupidPrizes
- holdmybeer

To modify the subreddit list, edit the `subreddits` array in `functions/src/index.ts`.

## Data Structure

The function stores the following data for each video:

```typescript
interface VideoData {
  title: string;
  url: string;
  thumbnail: string;
  permalink: string;
  created: number;
  is_video: boolean;
  video_url: string;
  video_source: "reddit";
  video_height: number | null;
  video_width: number | null;
  duration: number | null;
  bitrate: number | null;
  is_gif: boolean;
  has_audio: boolean;
  subreddit: string;
  nsfw: boolean;
  score: number;
  comments: number;
  author: string;
  upvoteRatio: number;
}
```

## Monitoring and Logging

The service includes comprehensive logging with emoji indicators:
- 📥 Post fetching
- 📊 Processing statistics
- 🎥 Video processing
- ✅ Successful operations
- ❌ Failed operations
- ⏭️ Skipped items

Error tracking includes:
- Memory usage monitoring
- Database operation verification
- Detailed error logs with context

## Contributing

Feel free to open issues or submit PRs if you have suggestions for improvements!

## License

MIT License - feel free to use this in your own projects! 