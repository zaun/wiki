/**
 * @file api/images.js
 * @description 
 */
import crypto from 'crypto';
import { v7 as uuidv7 } from 'uuid';
import { session } from '../storage/neo4j.js';
import { IMAGE_ROOT_ID } from '../storage/special.js';
import {
  getFingerprint,
  saveImage,
  cropImage,
  cropExists,
  urlOriginalImage,
  urlCropImage
} from '../storage/image.js';


const SECRET_KEY = Buffer.from('5d513650e0c43ee9483566870b653216bc26912373774cf5efbcab124af3787a', 'hex');
const HAMMING_THRESHOLD = 3;
const FORCE_SAVE_WINDOW_MS = 5 * 60 * 1000;


function makeForceSaveToken() {
  const iv = crypto.randomBytes(12);             // 96-bit nonce for GCM
  const ts = Date.now().toString();              // our “payload”
  const cipher = crypto.createCipheriv('aes-256-gcm', SECRET_KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(ts, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  // [ iv | authTag | ciphertext ] → base64
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function verifyForceSaveToken(token) {
  let data;
  try {
    data = Buffer.from(token, 'base64');
  } catch {
    return false;
  }
  if (data.length < 12 + 16) return false;  // iv (12) + tag (16)

  const iv = data.slice(0, 12);
  const authTag = data.slice(12, 28);
  const ciphertext = data.slice(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', SECRET_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted;
  try {
    decrypted = decipher.update(ciphertext, null, 'utf8') + decipher.final('utf8');
  } catch {
    return false;  // tampered or wrong key
  }

  const ts = parseInt(decrypted, 10);
  if (isNaN(ts)) return false;

  return (Date.now() - ts) <= FORCE_SAVE_WINDOW_MS;
}

export async function createImage(req, res) {
  const { filename, title, content, forceSave } = req.body;
  const now = new Date().toISOString();

  if (!filename) {
    return res.status(400).json({ error: 'filename is required.' });
  }
  if (!title) {
    return res.status(400).json({ error: 'title is required.' });
  }

  // Compute fingerprint
  let fp;
  try {
    fp = await getFingerprint(content);
  } catch (err) {
    console.error('💥 Error computing fingerprint:', err);
    return res.status(500).json({ error: 'Failed to compute image fingerprint.' });
  }

  // Decide if we should skip the duplicate‐check
  const skipSearch = forceSave && verifyForceSaveToken(forceSave);

  // Single session + transaction for read (duplicate‐check) and write
  const s = session();
  const tx = s.beginTransaction();
  try {
    // 3a) only run duplicate‐check if not forced
    if (!skipSearch) {
      const dupResult = await tx.run(
        `
          MATCH (i:Image)
          WHERE fingerprint.hamming(i.fingerprint, $fp) <= $threshold
          RETURN collect({ id: i.id, title: i.title }) AS images
          `,
        { fp, threshold: HAMMING_THRESHOLD }
      );
      const images = dupResult.records[0].get('images');

      if (images.length > 0) {
        // found duplicates → rollback and return them
        const newToken = makeForceSaveToken();
        await tx.rollback();
        return res.status(200).json({
          duplicateIds: images,
          forceSave: newToken
        });
      }
    }

    // No duplicates (or forced) → create the node
    const id = uuidv7();
    const sha256 = crypto
      .createHash('sha256')
      .update(Buffer.from(content, 'base64'))
      .digest('hex');

    // Store the file
    const imgBuf = Buffer.from(content, 'base64');
    const key = await saveImage(id, imgBuf);

    await tx.run(
      `
        CREATE (i:Image {
          id:           $id,
          title:        $title,
          filename:     $filename,
          sha256:       $sha256,
          fingerprint:  $fp,
          key:          $key,
          createdAt:    $now
        })
        WITH i
        MATCH (r:ImageRoot {id: $rootId})
        CREATE (r)-[:HAS_IMAGE]->(i)
        `,
      {
        id,
        title,
        filename,
        sha256,
        fp,
        key,
        now,
        rootId: IMAGE_ROOT_ID
      }
    );

    // Commit once, then return the new node info
    await tx.commit();
    return res.status(201).json({
      id,
      title,
      filename,
      sha256,
      key,
      createdAt: now
    });
  } catch (err) {
    // on any error → rollback
    await tx.rollback();
    console.error('💥 Error in createImage transaction:', err);
    return res.status(500).json({ error: 'Internal error saving image.' });
  } finally {
    // always close the session
    await s.close();
  }
}

export async function searchImage(req, res) {
  const { name, sha256, fingerprint, page = '1' } = req.query;
  const pageNum = parseInt(page, 10);
  if (isNaN(pageNum) || pageNum < 1) {
    return res.status(400).json({ error: 'Invalid page number.' });
  }

  // Require at least one search parameter
  if (!name && !sha256 && !fp) {
    return res.status(400).json({
      error: 'At least one search parameter (name, sha256, fp) is required.',
    });
  }

  const s = session();
  try {
    const whereClauses = [];
    const params = {
      skip: (pageNum - 1) * 15,
      limit: 15,
      threshold: HAMMING_THRESHOLD,
    };
    if (name) {
      whereClauses.push('toLower(i.name) CONTAINS toLower($name)');
      params.name = name;
    }
    if (sha256) {
      whereClauses.push('i.sha256 = $sha256');
      params.sha256 = sha256;
    }
    if (fingerprint) {
      whereClauses.push('fingerprint.hamming(i.fingerprint, $fp) <= $threshold');
      params.fp = fingerprint;
    }

    const query = `
        MATCH (i:Image)
        WHERE ${whereClauses.join(' OR ')}
        WITH i
        ORDER BY i.createdAt DESC
        SKIP $skip LIMIT $limit
        RETURN i.id AS id, i.name AS name, i.sha256 AS sha256, i.key AS key, i.createdAt AS createdAt
      `;

    const { records } = await s.run(query, params);
    const images = records.map(r => ({
      id: r.get('id'),
      name: r.get('name'),
      sha256: r.get('sha256'),
      key: r.get('key'),
      createdAt: r.get('createdAt'),
    }));

    return res.status(200).json({
      page: pageNum,
      pageSize: images.length,
      images,
    });
  } catch (err) {
    console.error('❌ Error in searchImage:', err);
    return res.status(500).json({ error: 'Internal error searching images.' });
  } finally {
    await s.close();
  }
}

export async function getImage(req, res) {
  const { id } = req.params;
  const cropParam = req.query.crop;

  const s = session();
  try {
    const result = await s.run(
      'MATCH (i:Image {id: $id}) RETURN i.key AS key',
      { id }
    );
    if (result.records.length === 0) {
      return res.status(404).json({ error: 'Image not found.' });
    }
    const key = result.records[0].get('key');

    // Check for query crop=x,y,w,h query
    if (cropParam) {
      const parts = cropParam.split(',').map(Number);
      if (parts.length !== 4 || parts.some((n) => isNaN(n))) {
        return res.status(400).json({ error: 'Invalid crop parameter.' });
      }
      const [x, y, w, h] = parts;
      
      const exists = await cropExists(key, x, y, w, h);
      if (exists) {
        return res.redirect(urlCropImage(key, x, y, w, h));
      } else {
        await cropImage(key, x, y, w, h);
        return res.redirect(urlCropImage(key, x, y, w, h));
      }
    }

    return res.redirect(urlOriginalImage(key));
  } catch (err) {
    console.error('❌ Error in getImage:', err);
    return res.status(500).json({ error: 'Internal error fetching image.' });
  } finally {
    await s.close();
  }
}