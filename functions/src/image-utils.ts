import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import fetch from "node-fetch";
import sharp from "sharp";

/**
 * Checks if an image is valid (not mostly black) by analyzing its pixels
 * @param {string} imagePath - Path to the image file to analyze
 * @param {number} threshold - Percentage threshold for black pixels (0-100)
 * @return {Promise<boolean>} True if the image is valid, false if it's mostly black
 */
async function isImageValid(imagePath: string, threshold = 90): Promise<boolean> {
  try {
    const image = sharp(imagePath);
    const stats = await image.stats();

    // Get the average brightness across all channels
    const totalPixels = stats.channels[0].mean * stats.channels.length;
    const blackThreshold = (threshold / 100) * 255 * stats.channels.length;

    // If the average brightness is below threshold, consider it invalid
    return totalPixels > blackThreshold;
  } catch (error) {
    console.error("Error analyzing image:", error);
    return false;
  }
}

/**
 * Downloads and validates an image from a URL
 * @param {string} imageUrl - URL of the image to validate
 * @return {Promise<boolean>} True if the image is valid and not mostly black
 */
export async function validateImageUrl(imageUrl: string): Promise<boolean> {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "img-"));
  const imagePath = path.join(tempDir, "image.jpg");

  try {
    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.buffer();
    await fs.promises.writeFile(imagePath, buffer);

    // Validate the image
    const isValid = await isImageValid(imagePath);

    // Clean up
    await fs.promises.rm(tempDir, {recursive: true, force: true});

    return isValid;
  } catch (error) {
    console.error("Error validating image:", error);
    // Clean up on error
    await fs.promises.rm(tempDir, {recursive: true, force: true});
    return false;
  }
}
