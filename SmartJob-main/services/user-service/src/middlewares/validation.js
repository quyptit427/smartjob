import { z, text, skills } from '@smartjob/shared/validation';

export const registerSchema = z
  .object({
    name: text(100),
    email: z.string().trim().email().max(254).toLowerCase(),
    password: z
      .string()
      .min(8, 'Mật khẩu cần ít nhất 8 ký tự.')
      .refine((s) => Buffer.byteLength(s, 'utf8') <= 72, 'Mật khẩu tối đa 72 byte.'),
    role: z.enum(['CANDIDATE', 'RECRUITER']).default('CANDIDATE'),
  })
  .strict();
export const loginSchema = registerSchema.pick({ email: true, password: true });

const educationItem = z
  .object({
    school: z.string().trim().max(150).default(''),
    degree: z.string().trim().max(120).default(''),
    field: z.string().trim().max(120).default(''),
    period: z.string().trim().max(60).default(''),
  })
  .strict();

const workExperienceItem = z
  .object({
    title: z.string().trim().max(150).default(''),
    company: z.string().trim().max(150).default(''),
    period: z.string().trim().max(60).default(''),
    description: z.string().trim().max(1000).default(''),
  })
  .strict();

const languageItem = z
  .object({
    name: z.string().trim().max(60).default(''),
    level: z.string().trim().max(40).default(''),
  })
  .strict();

const linksSchema = z
  .object({
    linkedin: z.string().trim().max(300).default(''),
    github: z.string().trim().max(300).default(''),
    portfolio: z.string().trim().max(300).default(''),
  })
  .strict();

export const profileSchema = z
  .object({
    name: text(100).optional(),
    skills: skills.optional(),
    experienceYears: z.number().min(0).max(60).optional(),
    desiredPosition: z.string().trim().max(150).optional(),
    location: z.string().trim().max(150).optional(),
    companyName: z.string().trim().max(150).optional(),
    phone: z.string().trim().max(30).optional(),
    bio: z.string().trim().max(3000).optional(),
    education: z.array(educationItem).max(10).optional(),
    workExperience: z.array(workExperienceItem).max(15).optional(),
    certifications: z
      .array(z.string().trim().min(1).max(120))
      .max(20)
      .optional(),
    languages: z.array(languageItem).max(12).optional(),
    links: linksSchema.optional(),
  })
  .strict();
