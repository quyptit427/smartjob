import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { ApiError } from '@smartjob/shared/errors';
import { Resume } from '../models/Resume.js';

const MAX_SIZE = 5 * 1024 * 1024;
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
  if (body.subarray(0, 5).toString('ascii') !== '%PDF-')
    throw new ApiError(400, 'File tải lên không phải PDF hợp lệ.', 'INVALID_PDF');

  await mkdir(storageDir, { recursive: true });
  const storedName = `${randomUUID()}.pdf`;
  const filePath = join(storageDir, storedName);
  await writeFile(filePath, body, { flag: 'wx', mode: 0o600 });
  const previous = await Resume.findOne({ userId });
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
  await unlink(join(storageDir, resume.storedName)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
