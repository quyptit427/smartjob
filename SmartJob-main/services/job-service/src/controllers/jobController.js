import * as jobs from '../services/jobService.js';
import { indexJob, removeJobVector } from '../clients/vectorClient.js';
export const list = async (req, res) => res.json({ data: await jobs.listJobs(req.validated) });
export const mine = async (req, res) =>
  res.json({ data: await jobs.listJobs(req.validated, req.user.id) });
export const get = async (req, res) => res.json({ data: await jobs.getJob(req.params.id) });
export const create = async (req, res) => {
  const job = await jobs.createJob(req.validated, req.user.id);
  await indexJob(job);
  res.status(201).json({ data: job });
};
export const update = async (req, res) => {
  const job = await jobs.updateJob(req.params.id, req.user.id, req.validated);
  await indexJob(job);
  res.json({ data: job });
};
export const remove = async (req, res) => {
  await jobs.deleteJob(req.params.id, req.user.id);
  await removeJobVector(req.params.id);
  res.status(204).end();
};
export const internalList = async (req, res) =>
  res.json({ data: await jobs.openJobs(req.validated) });
