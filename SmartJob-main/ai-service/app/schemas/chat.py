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
