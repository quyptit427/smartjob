import * as resumes from '../services/resumeService.js';

export const get = async (req, res) =>
  res.json({ data: await resumes.getResume(req.user.id) });

export const upload = async (req, res) =>
  res.json({
    data: await resumes.uploadResume(
      req.user.id,
      req.body,
      req.headers['x-file-name'],
      req.app.locals.resumeStorageDir,
    ),
  });

export const download = async (req, res) => {
  const file = await resumes.readResume(req.user.id, req.app.locals.resumeStorageDir);
  res.set('content-type', 'application/pdf');
  res.set('content-disposition', `attachment; filename="cv.pdf"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.send(file.data);
};

export const internalDownload = async (req, res) => {
  const file = await resumes.readResume(req.params.id, req.app.locals.resumeStorageDir);
  res.set('content-type', 'application/pdf');
  res.set('content-disposition', `attachment; filename="cv.pdf"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.send(file.data);
};

export const remove = async (req, res) => {
  await resumes.deleteResume(req.user.id, req.app.locals.resumeStorageDir);
  res.status(204).end();
};
