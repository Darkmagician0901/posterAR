/**
 * Image Upload Utility
 * Handles file validation, processing, and optimization
 */

/**
 * Supported image formats
 */
export const SUPPORTED_FORMATS = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

/**
 * Maximum file size (5MB)
 */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Maximum image dimensions for optimization
 */
export const MAX_IMAGE_WIDTH = 2048;
export const MAX_IMAGE_HEIGHT = 2048;

/**
 * Image validation result
 */
export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  file?: File;
}

/**
 * Processed image result
 */
export interface ProcessedImage {
  dataUrl: string;
  width: number;
  height: number;
  size: number;
  originalName: string;
}

/**
 * Validate image file
 */
export const validateImageFile = (file: File): ImageValidationResult => {
  // Check if file exists
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Check file type
  if (!SUPPORTED_FORMATS.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file format. Please use PNG, JPEG, or WebP.`,
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size exceeds ${sizeMB}MB limit.`,
    };
  }

  return { valid: true, file };
};

/**
 * Load image from file
 */
const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Resize image if needed
 */
const resizeImage = (
  img: HTMLImageElement,
  maxWidth: number = MAX_IMAGE_WIDTH,
  maxHeight: number = MAX_IMAGE_HEIGHT
): HTMLCanvasElement => {
  let { width, height } = img;

  // Calculate new dimensions while maintaining aspect ratio
  if (width > maxWidth || height > maxHeight) {
    const aspectRatio = width / height;

    if (width > height) {
      width = maxWidth;
      height = width / aspectRatio;
    } else {
      height = maxHeight;
      width = height * aspectRatio;
    }
  }

  // Create canvas and draw resized image
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Use high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(img, 0, 0, width, height);

  return canvas;
};

/**
 * Process and optimize image file
 */
export const processImage = async (file: File): Promise<ProcessedImage> => {
  try {
    // Load image
    const img = await loadImage(file);

    // Resize if needed
    const canvas = resizeImage(img);

    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/png', 0.9);

    return {
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      size: dataUrl.length,
      originalName: file.name,
    };
  } catch (error) {
    throw new Error(`Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Validate and process image file
 */
export const validateAndProcessImage = async (file: File): Promise<ProcessedImage> => {
  // Validate file
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Process image
  return await processImage(file);
};

/**
 * Create object URL from file (for preview)
 */
export const createPreviewUrl = (file: File): string => {
  return URL.createObjectURL(file);
};

/**
 * Revoke object URL (cleanup)
 */
export const revokePreviewUrl = (url: string): void => {
  URL.revokeObjectURL(url);
};

// Made with Bob