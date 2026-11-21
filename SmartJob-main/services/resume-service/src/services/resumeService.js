import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import mongoose from 'mongoose';
import { ApiError } from '@smartjob/shared/errors';
import { Resume } from '../models/Resume.js';

const useGridFs = () => process.env.RESUME_STORAGE === 'gridfs';
const isGridId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ''));
const bucket = () => {
  const db = mongoose.connection.db;
  if (!db) throw new ApiError(503, 'Kho CV chưa sẵn sàng.', 'RESUME_STORAGE_UNAVAILABLE');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: 'cv' });
};
const uploadGridFile = (body, filename, userId) =>
  new Promise((resolve, reject) => {
    const stream = bucket().openUploadStream(filename, {
      contentType: 'application/pdf',
      metadata: { userId },
    });
    stream.on('error', reject);
    stream.on('finish', () => resolve(String(stream.id)));
    stream.end(body);
  });
const downloadGridFile = (id) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const stream = bucket().openDownloadStream(new mongoose.Types.ObjectId(id));
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
const deleteGridFile = async (id) => {
  if (!isGridId(id)) return;
  await bucket()
    .delete(new mongoose.Types.ObjectId(id))
    .catch((error) => {
      if (error.codeName !== 'FileNotFound') throw error;
    });
};

const MAX_SIZE = 5 * 1024 * 1024;
// Acrobat accepts %PDF- anywhere in the first 1024 bytes (leading junk / BOM).
const isPdfBuffer = (body) => {
  const end = Math.min(body.length, 1024);
  for (let i = 0; i <= end - 5; i += 1) {
    if (
      body[i] === 0x25 &&
      body[i + 1] === 0x50 &&
      body[i + 2] === 0x44 &&
      body[i + 3] === 0x46 &&
      body[i + 4] === 0x2d
    )
      return true;
  }
  return false;
};
const safeName = (value) => {
  let decoded = String(value || 'cv.pdf');
  try { decoded = decodeURIComponent(decoded); } catch {}
  const name = basename(decoded)
    .replace(/[\r\n"\\/]/g, '_')
    .trim()
    .slice(0, 150);
  return name.toLowerCase().endsWith('.pdf') ? name : `${name || 'cv'}.pdf`;
};
const publicResume = (resume) => ({
  originalName: resume.originalName,
  size: resume.size,
  mimeType: resume.mimeType,
  uploadedAt: resume.updatedAt,
});

export async function getResume(userId) {
  const resume = await Resume.findOne({ userId });
  return resume ? publicResume(resume) : null;
}

export async function uploadResume(userId, body, originalName, storageDir) {
  if (!Buffer.isBuffer(body) || body.length === 0)
    throw new ApiError(400, 'Vui lòng chọn file PDF.', 'RESUME_REQUIRED');
  if (body.length > MAX_SIZE)
    throw new ApiError(413, 'CV không được vượt quá 5 MB.', 'PAYLOAD_TOO_LARGE');
  if (!isPdfBuffer(body))
    throw new ApiError(
      400,
      'File tải lên không phải PDF hợp lệ. Hãy xuất/Save as PDF — không chỉ đổi đuôi .pdf.',
      'INVALID_PDF',
    );

  const previous = await Resume.findOne({ userId });
  if (useGridFs()) {
    const storedName = await uploadGridFile(body, `${randomUUID()}.pdf`, userId);
    try {
      const resume = await Resume.findOneAndUpdate(
        { userId },
        { userId, storedName, originalName: safeName(originalName), size: body.length, mimeType: 'application/pdf' },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
      if (previous?.storedName) await deleteGridFile(previous.storedName);
      return publicResume(resume);
    } catch (error) {
      await deleteGridFile(storedName);
      throw error;
    }
  }

  await mkdir(storageDir, { recursive: true });
  const storedName = `${randomUUID()}.pdf`;
  const filePath = join(storageDir, storedName);
  await writeFile(filePath, body, { flag: 'wx', mode: 0o600 });
  try {
    const resume = await Resume.findOneAndUpdate(
      { userId },
      { userId, storedName, originalName: safeName(originalName), size: body.length, mimeType: 'application/pdf' },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    if (previous) await unlink(join(storageDir, previous.storedName)).catch(() => {});
    return publicResume(resume);
  } catch (error) {
    await unlink(filePath).catch(() => {});
    throw error;
  }
}

export async function readResume(userId, storageDir) {
  const resume = await Resume.findOne({ userId });
  if (!resume) throw new ApiError(404, 'Bạn chưa tải CV lên.', 'RESUME_NOT_FOUND');
  if (useGridFs()) {
    try {
      return { data: await downloadGridFile(resume.storedName), name: resume.originalName };
    } catch {
      throw new ApiError(404, 'Không tìm thấy file CV.', 'RESUME_FILE_NOT_FOUND');
    }
  }
  try {
    return { data: await readFile(join(storageDir, resume.storedName)), name: resume.originalName };
  } catch (error) {
    if (error.code === 'ENOENT')
      throw new ApiError(404, 'Không tìm thấy file CV.', 'RESUME_FILE_NOT_FOUND');
    throw error;
  }
}

export async function deleteResume(userId, storageDir) {
  const resume = await Resume.findOneAndDelete({ userId });
  if (!resume) throw new ApiError(404, 'Bạn chưa tải CV lên.', 'RESUME_NOT_FOUND');
  if (useGridFs()) {
    await deleteGridFile(resume.storedName);
    return;
  }
  await unlink(join(storageDir, resume.storedName)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
