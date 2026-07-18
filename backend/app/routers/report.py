from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.github import GitHubTokenNotConfigured
from app.mailer import send_report_email, smtp_configured
from app.models import ReportLog
from app.report_generator import generate_report
from app.schemas import (
    ReportConfig,
    ReportResponse,
    ReportSchedule as ReportScheduleSchema,
    SendReportRequest,
    SendReportResponse,
)
from app.scheduler import get_or_create_schedule, reschedule

router = APIRouter(prefix="/api/report", tags=["report"])


@router.get("", response_model=ReportResponse)
async def get_report(db: AsyncSession = Depends(get_db)) -> ReportResponse:
    try:
        report = await generate_report(db)
    except GitHubTokenNotConfigured:
        raise HTTPException(status_code=400, detail="No GitHub token configured — add one in Settings.")
    return ReportResponse(**report)


@router.get("/config", response_model=ReportConfig)
async def get_report_config() -> ReportConfig:
    return ReportConfig(
        default_email=get_settings().default_report_email,
        smtp_configured=smtp_configured(),
    )


@router.post("/send", response_model=SendReportResponse)
async def send_report(body: SendReportRequest, db: AsyncSession = Depends(get_db)) -> SendReportResponse:
    if not smtp_configured():
        raise HTTPException(status_code=400, detail="SMTP is not configured — set SMTP_* values in backend/.env.")
    try:
        report = await generate_report(db)
    except GitHubTokenNotConfigured:
        raise HTTPException(status_code=400, detail="No GitHub token configured — add one in Settings.")

    repo_count = len(report["repos"])
    status = "sent"
    detail = None
    try:
        await send_report_email(body.email, report)
    except Exception as exc:
        status = "failed"
        detail = str(exc)

    db.add(ReportLog(email=body.email, repo_count=repo_count, status=status))
    await db.commit()

    if status == "failed":
        raise HTTPException(status_code=502, detail=f"Send failed: {detail}")
    return SendReportResponse(status=status, email=body.email, repo_count=repo_count, detail=detail)


@router.get("/schedule", response_model=ReportScheduleSchema)
async def get_schedule(db: AsyncSession = Depends(get_db)) -> ReportScheduleSchema:
    schedule = await get_or_create_schedule(db)
    return ReportScheduleSchema(
        enabled=schedule.enabled,
        cadence=schedule.cadence,
        time=schedule.time,
        day_of_week=schedule.day_of_week,
        email=schedule.email,
    )


@router.put("/schedule", response_model=ReportScheduleSchema)
async def update_schedule(
    body: ReportScheduleSchema, db: AsyncSession = Depends(get_db)
) -> ReportScheduleSchema:
    if body.cadence not in ("daily", "weekly"):
        raise HTTPException(status_code=400, detail="cadence must be 'daily' or 'weekly'")

    schedule = await get_or_create_schedule(db)
    schedule.enabled = body.enabled
    schedule.cadence = body.cadence
    schedule.time = body.time
    schedule.day_of_week = body.day_of_week
    schedule.email = body.email
    await db.commit()
    await db.refresh(schedule)

    reschedule(schedule)
    return ReportScheduleSchema(
        enabled=schedule.enabled,
        cadence=schedule.cadence,
        time=schedule.time,
        day_of_week=schedule.day_of_week,
        email=schedule.email,
    )
