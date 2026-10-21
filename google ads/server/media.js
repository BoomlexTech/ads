import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads');
export const uploadsDir = dir;

// Only these types are accepted, and the stored extension comes from the mimetype
// (never from the client's filename) so nothing like .html/.svg can be hosted.
export const MEDIA_TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

// The declared type is only a claim: check the first bytes really are that kind of file
// (a .txt renamed to .png would otherwise replace a good image with a broken one).
const ascii = (b, from, to) => b.subarray(from, to).toString('latin1');
const BOX = ['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip'];
const SIGNATURES = {
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': (b) => ascii(b, 0, 4) === 'GIF8',
  'image/webp': (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
  'video/mp4': (b) => BOX.includes(ascii(b, 4, 8)),
  'video/quicktime': (b) => BOX.includes(ascii(b, 4, 8)),
  'video/webm': (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
};

export const cloudinaryOn = () => !!(process.env.CLOUDINARY_URL ||
  (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET));

// All ad media lives in its own Cloudinary folder (override with CLOUDINARY_FOLDER).
const folder = () => process.env.CLOUDINARY_FOLDER || 'google-ads-demo';

export function initCloudinary() {
  if (!cloudinaryOn()) return;
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
  cloudinary.config({ secure: true });
  // Create the dedicated folder up front so it shows in the Media Library (best effort:
  // needs Admin API permission; otherwise Cloudinary creates it on the first upload).
  cloudinary.api.create_folder(folder()).catch(() => {});
}

// Cloudinary when configured, otherwise local disk so the demo works with zero setup.
export async function saveMedia(file) {
  const ext = MEDIA_TYPES[file.mimetype];
  if (!ext) throw Object.assign(new Error('Unsupported file type - use JPG, PNG, GIF, WEBP, MP4, MOV or WEBM'), { status: 400 });
  const type = file.mimetype.startsWith('video') ? 'video' : 'image';
  if (!SIGNATURES[file.mimetype](file.buffer)) throw Object.assign(new Error(`This file is not a valid ${type} - choose a real ${type === 'image' ? 'JPG, PNG, GIF or WEBP image' : 'MP4, MOV or WEBM video'}`), { status: 400 });
  if (type === 'image' && file.buffer.length > 10 * 1024 * 1024) // Cloudinary's image cap
    throw Object.assign(new Error('Images can be up to 10 MB (videos up to 50 MB)'), { status: 413, expose: true });
  if (cloudinaryOn()) {
    const r = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: folder(), resource_type: type },
        (err, out) => (err ? reject(err) : resolve(out)),
      ).end(file.buffer);
    }).catch((e) => {
      throw Object.assign(new Error(e.http_code === 403
        ? 'Cloudinary rejected the upload (403): this API key has no upload permission - enable it in Cloudinary > Settings > API Keys'
        : `Cloudinary upload failed${e.message ? ': ' + e.message : ''}`), { status: 502, expose: true });
    });
    return { url: r.secure_url, publicId: r.public_id, type, provider: 'cloudinary' };
  }
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), file.buffer);
  return { url: `/uploads/${name}`, publicId: name, type, provider: 'local' };
}

// Remove a stored file. Callers must first make sure no other ad still uses it.
export async function deleteMedia(media) {
  if (!media?.publicId) return;
  try {
    if (media.provider === 'cloudinary' && cloudinaryOn()) {
      await cloudinary.uploader.destroy(media.publicId, { resource_type: media.type || 'image', invalidate: true });
    } else if (media.provider === 'local') {
      const file = path.join(dir, path.basename(media.publicId)); // basename: no path traversal
      if (file.startsWith(dir)) fs.rmSync(file, { force: true });
    }
  } catch (e) {
    console.warn('media cleanup failed:', e.message);
  }
}
