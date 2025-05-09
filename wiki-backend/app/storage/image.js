import { fileTypeFromBuffer } from 'file-type';
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand
} from '@aws-sdk/client-s3';
import { bmvbhash } from 'blockhash-core';
import sharp from 'sharp';
import * as cheerio from 'cheerio';

// initialize S3 client
const region = process.env.AWS_REGION || 'us-west-2';
const accessKeyId = process.env.S3_KEY || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET || process.env.AWS_SECRET_ACCESS_KEY;
const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.BUCKET;

const clientConfig = { region };
if (accessKeyId && secretAccessKey) {
    clientConfig.credentials = { accessKeyId, secretAccessKey };
}
if (endpoint) {
    clientConfig.endpoint = endpoint;
    clientConfig.forcePathStyle = true;
}

export const s3 = new S3Client(clientConfig);

/**
 * Helper to accumulate a stream into a Buffer
 */
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

/**
 * Compute a perceptual fingerprint for a Base64 image.
 *
 * @param {string} base64  – The image data as a Base64 string
 * @param {Object} opts
 * @param {number} [opts.bits=32]  – Hash size (32 → 1024‑bit hash)
 * @param {boolean} [opts.raw=false]  – If true, return a Buffer of raw bytes
 * @returns {Promise<string|Buffer>}
 */
export async function getFingerprint(base64, opts = {}) {
    const { bits = 32, raw = false } = opts;
    const imgBuf = Buffer.from(base64, 'base64');
    const size = bits * 4;

    // Load & resize to RGBA
    const { data } = await sharp(imgBuf)
        .raw()
        .ensureAlpha()
        .resize(size, size)
        .toBuffer({ resolveWithObject: true });

    // Convert RGBA → grayscale
    const gray = new Uint8ClampedArray(size * size);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        gray[j] = ((data[i] + data[i + 1] + data[i + 2]) / 3) | 0;
    }

    // Wrap in ImageData shape
    const imageData = {
        data: gray,
        width: size,
        height: size
    };

    // Compute perceptual hash
    const hex = bmvbhash(imageData, bits);
    return raw ? Buffer.from(hex, 'hex') : hex;
}

/**
 * Save a Buffer image to S3 under /original/<id>.<ext>
 */
export async function saveImage(id, buffer) {
    if (!bucket) {
        throw new Error('Missing BUCKET environment variable');
    }

    const typeInfo = await fileTypeFromBuffer(buffer);
    let ext = typeInfo?.ext || 'bin';
    let contentType = typeInfo?.mime || 'application/octet-stream';

    if (ext === 'xml') {
        const header = buffer.toString('utf8', 0, 1024).toLowerCase();
        if (header.includes('<svg')) {
            ext = 'svg';
            contentType = 'image/svg+xml';
        }
    }
    const key = `${id}.${ext}`;

    await s3.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: `original/${key}`,
            Body: buffer,
            ContentType: contentType,
            ACL: 'public-read',
        })
    );

    return key;
}

async function cropSvgBuffer(buffer, x, y, w, h) {
    // load SVG as XML
    const svgText = buffer.toString('utf8')
    const $ = cheerio.load(svgText, { xmlMode: true })
    const $svg = $('svg')

    // get original width/height from attributes (or fallback to viewBox size)
    const origW = parseFloat($svg.attr('width') || $svg.attr('viewBox').split(' ')[2])
    const origH = parseFloat($svg.attr('height') || $svg.attr('viewBox').split(' ')[3])

    // compute absolute crop region in user units
    const left = Math.max(0, Math.round((x / 100) * origW));
    const top = Math.max(0, Math.round((y / 100) * origH));
    const cropW = Math.min(Math.round((w / 100) * origW), origW - left);
    const cropH = Math.min(Math.round((h / 100) * origH), origH - top);

    // set new viewBox and dimensions
    $svg.attr('viewBox', `${left} ${top} ${cropW} ${cropH}`)
    $svg.attr('width', cropW)
    $svg.attr('height', cropH)

    // serialize back to SVG text
    const croppedSvgText = $.xml($svg)
    return Buffer.from(croppedSvgText.trim(), 'utf8')
}


/**
 * Crop an image stored in S3 by percentage and save under /crops/<id>-x-y-w-h.<ext>
 */
export async function cropImage(key, x, y, w, h) {
    if (!bucket) {
        throw new Error('Missing BUCKET environment variable');
    }

    // Download
    const response = await s3.send(new GetObjectCommand({
        Bucket: bucket,
        Key: `original/${key}`
    }));
    const inputBuffer = await streamToBuffer(response.Body);

    // Detect SVG by S3 ContentType instead of file extension
    const contentType = response.ContentType || '';
    const isSvg = contentType === 'image/svg+xml';

    let croppedBuffer;
    let outMime = contentType;
    if (isSvg) {
        croppedBuffer = await cropSvgBuffer(inputBuffer, x, y, w, h)
    } else {
        // Build pipeline (rasterize SVG → PNG at 300dpi; leave others alone)
        let pipeline = sharp(inputBuffer);

        // Read real pixel dimensions
        const meta = await pipeline.metadata();
        const origW = meta.width;
        const origH = meta.height;
        if (!origW || !origH) {
            throw new Error('Unable to determine image dimensions');
        }

        // Compute pixel crop region (clamped)
        const left = Math.max(0, Math.round((x / 100) * origW));
        const top = Math.max(0, Math.round((y / 100) * origH));
        const cropW = Math.min(Math.round((w / 100) * origW), origW - left);
        const cropH = Math.min(Math.round((h / 100) * origH), origH - top);

        // Perform crop
        croppedBuffer = await pipeline
            .extract({ left, top, width: cropW, height: cropH })
            .toBuffer();

        const typeInfo = await fileTypeFromBuffer(croppedBuffer);
        outMime = typeInfo?.mime || 'application/octet-stream';
    }

    // Derive new key
    const baseName = key.replace(/\.[^/.]+$/, '');
    const ext = key.split('.').pop();
    const fx = Number(x).toFixed(3);
    const fy = Number(y).toFixed(3);
    const fw = Number(w).toFixed(3);
    const fh = Number(h).toFixed(3);
    const cropKey = `${baseName}-${fx}-${fy}-${fw}-${fh}.${ext}`;

    // Upload
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `crops/${cropKey}`,
        Body: croppedBuffer,
        ContentType: outMime,
        ACL: 'public-read',
    }));

    return cropKey;
}

export async function cropExists(key, x, y, w, h) {
    // Format percentages to 3 decimal places
    const fx = Number(x).toFixed(3);
    const fy = Number(y).toFixed(3);
    const fw = Number(w).toFixed(3);
    const fh = Number(h).toFixed(3);

    // Derive extension and new key
    const idParts = key.split('.');
    const cropKey = `${idParts[0]}-${fx}-${fy}-${fw}-${fh}.${idParts[1]}`;

    try {
        // Try to fetch the object's metadata
        await s3.send(new HeadObjectCommand({
            Bucket: bucket,
            Key: cropKey,
        }));
        return true;
    } catch (err) {
        // 404 = not found → return false; other errors bubble up
        const status = err.$metadata?.httpStatusCode;
        if (status === 404) return false;
        throw err;
    }
}

export function urlOriginalImage(key) {
    if (!bucket) {
        throw new Error('Missing BUCKET environment variable');
    }

    // Construct the standard S3 public URL
    if (endpoint) {
        return `${endpoint}/${bucket}/original/${encodeURIComponent(key)}`;
    }
    return `https://s3.${region}.amazonaws.com/${bucket}/original/${encodeURIComponent(key)}`;

}

export function urlCropImage(key, x, y, w, h) {
    if (!bucket) {
        throw new Error('Missing BUCKET environment variable');
    }

    // Format percentages to 3 decimal places
    const fx = Number(x).toFixed(3);
    const fy = Number(y).toFixed(3);
    const fw = Number(w).toFixed(3);
    const fh = Number(h).toFixed(3);

    // Derive extension and new key
    const idParts = key.split('.');
    const cropKey = `${idParts[0]}-${fx}-${fy}-${fw}-${fh}.${idParts[1]}`;

    // Construct the standard S3 public URL
    if (endpoint) {
        return `${endpoint}/${bucket}/crops/${encodeURIComponent(cropKey)}`;
    }
    return `https://s3.${region}.amazonaws.com/${bucket}/crops/${encodeURIComponent(cropKey)}`;

}