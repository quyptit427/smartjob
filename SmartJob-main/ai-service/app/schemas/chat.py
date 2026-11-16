from pydantic import BaseModel, ConfigDict, Field
from typing import Literal


class ChatRequest(BaseModel):
    message: str = Field(
        default="Phân tích CV và gợi ý các công việc phù hợp với tôi.",
        min_length=1,
        max_length=1200,
    )


class CvProfile(BaseModel):
    summary: str
    skills: list[str]
    experience_roles: list[str]
    target_roles: list[str]
    experience_years: float | None
    location: str | None


class JobCard(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    title: str
    companyName: str
    location: str
    salaryMin: float
    salaryMax: float
    requiredSkills: list[str]
    experienceMin: float
    jobType: str
    description: str


class JobRecommendation(BaseModel):
    job: JobCard
    priority: Literal["high", "related"]
    similarity: float = Field(ge=-1, le=1)
    reason: str
    skill_gaps: list[str]


class ChatResponse(BaseModel):
    answer: str
    profile: CvProfile
    recommendations: list[JobRecommendation]


class ChatEnvelope(BaseModel):
    data: ChatResponse


class AdviceRecommendation(BaseModel):
    job_id: str
    reason: str
    skill_gaps: list[str]


class AdviceResult(BaseModel):
    answer: str
    recommendations: list[AdviceRecommendation]


class AdvisorBundle(BaseModel):
    profile: CvProfile
    answer: str
    recommendations: list[AdviceRecommendation]


class EducationItem(BaseModel):
    school: str = ""
    degree: str = ""
    field: str = ""
    period: str = ""


class WorkExperienceItem(BaseModel):
    title: str = ""
    company: str = ""
    period: str = ""
    description: str = ""


class LanguageItem(BaseModel):
    name: str = ""
    level: str = ""


class ProfileLinks(BaseModel):
    linkedin: str | None = None
    github: str | None = None
    portfolio: str | None = None


class ExtractedProfile(BaseModel):
    name: str | None = None
    phone: str | None = None
    location: str | None = None
    experience_years: float | None = None
    desired_position: str | None = None
    skills: list[str] = Field(default_factory=list)
    bio: str | None = None
    education: list[EducationItem] = Field(default_factory=list)
    work_experience: list[WorkExperienceItem] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    languages: list[LanguageItem] = Field(default_factory=list)
    links: ProfileLinks = Field(default_factory=ProfileLinks)


class ExtractProfileEnvelope(BaseModel):
    data: ExtractedProfile
