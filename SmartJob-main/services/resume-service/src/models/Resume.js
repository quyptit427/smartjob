import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    storedName: { type: String, required: true },
    originalName: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, enum: ['application/pdf'], default: 'application/pdf' },
  },
  { timestamps: true },
);

export const Resume = mongoose.model('Resume', resumeSchema);
