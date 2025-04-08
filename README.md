# Video Thumbnail Generator

A robust Firebase Cloud Function service that automatically generates high-quality thumbnails from video URLs. Built with TypeScript and FFmpeg, this service handles videos of any aspect ratio and creates optimized thumbnails without distortion.

## Features

- 🎯 Smart aspect ratio detection (handles everything from ultrawide to tall portrait videos)
- 🖼️ Adaptive thumbnail sizing with 5 optimized formats:
  - Landscape (16:9)
  - Wide (4:3)
  - Square (1:1)
  - Tall (3:4)
  - Portrait (9:16)
- 🔄 Efficient processing using FFmpeg stream seeking
- ☁️ Firebase Storage integration with signed URLs
- 🎨 High-quality JPEG output (640p base dimension)
- 📊 Comprehensive logging system with emoji indicators
- 🛡️ Advanced error handling and recovery
- 🔍 Memory usage monitoring and optimization
- 🔄 Batch processing with configurable sizes
- ☁️ Firebase Storage integration with signed URLs
- 🎨 High-quality JPEG output with smart compression
- 🛡️ Error handling and cleanup of temporary files

## Tech Stack

- TypeScript
- Firebase Cloud Functions (v2)
- FFmpeg for video processing
- Firebase Admin SDK
- Firebase Storage

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

## Usage

The service exposes a callable Cloud Function that accepts:

```typescript
interface ThumbnailData {
  videoUrl: string;
  videoId: string;
}
```

And returns:

```typescript
interface ThumbnailResponse {
  thumbnailUrl: string;
}
```

Example usage:

```typescript
const result = await functions.httpsCallable('generateThumbnail')({
  videoUrl: 'https://example.com/video.mp4',
  videoId: 'unique-video-id'
});

console.log(result.data.thumbnailUrl);
```

## Architecture

The service uses a multi-step process:
1. Analyzes the video's aspect ratio to determine the optimal thumbnail dimensions
2. Extracts a frame from the 50% mark of the video duration using FFmpeg
3. Processes and uploads the thumbnail to Firebase Storage
4. Returns a signed URL valid for one year
5. Stores metadata including original and final dimensions

## Performance

- Minimal memory footprint using stream processing
- Memory usage monitoring with automatic garbage collection
- Configurable batch sizes for optimal performance
- Smart delays between operations to prevent rate limiting
- Fast thumbnail generation by seeking directly to target frame
- Efficient cleanup of temporary files
- Optimized for Cloud Functions execution environment

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
- Automatic retry mechanisms

## Contributing

Feel free to open issues or submit PRs if you have suggestions for improvements!

## License

MIT License - feel free to use this in your own projects! 